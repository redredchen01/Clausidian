"""Unit 3: Text Detector Tests (mock-based, no real OCR model)"""
from collections import namedtuple
from typing import List
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from src.detect.candidate_filter import CandidateFilter
from src.detect.detection_sampler import TextDetectionSampler
from src.detect.easyocr_detector import BBox, EasyOCRDetector


def _make_text_frame(text: str = "watermark") -> np.ndarray:
    frame = np.full((480, 640, 3), 80, dtype=np.uint8)
    cv2.putText(frame, text, (30, 450), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 2)
    return frame


def _mock_reader(bboxes_conf):
    """Returns a mock easyocr.Reader that yields fixed results"""
    reader = MagicMock()
    # readtext returns list of (pts, text, conf)
    results = [
        ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], "text", conf)
        for (x, y, w, h, conf) in bboxes_conf
    ]
    reader.readtext.return_value = results
    return reader


class TestEasyOCRDetector:
    def test_detect_returns_bboxes(self):
        detector = EasyOCRDetector(confidence_threshold=0.3, bbox_padding=0)
        mock_reader = _mock_reader([(10, 20, 100, 30, 0.9)])
        detector._reader = mock_reader

        frame = _make_text_frame()
        bboxes = detector.detect(frame)
        assert len(bboxes) == 1
        assert bboxes[0].conf == 0.9
        assert bboxes[0].w > 0
        assert bboxes[0].h > 0

    def test_detect_filters_low_confidence(self):
        detector = EasyOCRDetector(confidence_threshold=0.5, bbox_padding=0)
        mock_reader = _mock_reader([(10, 20, 100, 30, 0.3)])  # below threshold
        detector._reader = mock_reader

        bboxes = detector.detect(_make_text_frame())
        assert bboxes == []

    def test_detect_empty_frame_returns_empty(self):
        detector = EasyOCRDetector()
        mock_reader = MagicMock()
        mock_reader.readtext.return_value = []
        detector._reader = mock_reader

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bboxes = detector.detect(frame)
        assert bboxes == []

    def test_bbox_padding_clamped_to_frame(self):
        detector = EasyOCRDetector(confidence_threshold=0.0, bbox_padding=50)
        # bbox near edge: x=5, y=5, w=20, h=20 — padding would go negative
        mock_reader = _mock_reader([(5, 5, 20, 20, 0.8)])
        detector._reader = mock_reader

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bboxes = detector.detect(frame)
        assert len(bboxes) == 1
        assert bboxes[0].x >= 0
        assert bboxes[0].y >= 0
        assert bboxes[0].x + bboxes[0].w <= 640
        assert bboxes[0].y + bboxes[0].h <= 480

    def test_import_error_on_missing_easyocr(self, monkeypatch):
        import builtins
        real_import = builtins.__import__

        def mock_import(name, *args, **kwargs):
            if name == "easyocr":
                raise ImportError("No module named 'easyocr'")
            return real_import(name, *args, **kwargs)

        detector = EasyOCRDetector()
        monkeypatch.setattr(builtins, "__import__", mock_import)
        with pytest.raises(ImportError, match="easyocr not installed"):
            detector._get_reader()


class TestCandidateFilter:
    def test_filter_small_bbox(self):
        f = CandidateFilter()
        bboxes = [BBox(10, 10, 10, 10, 0.9)]  # area=100, below min_area=200
        result = f.filter(bboxes, frame_h=480, frame_w=640, min_area=200)
        assert result == []

    def test_filter_large_bbox_passes(self):
        f = CandidateFilter()
        bboxes = [BBox(10, 10, 50, 50, 0.9)]  # area=2500
        result = f.filter(bboxes, frame_h=480, frame_w=640, min_area=200)
        assert len(result) == 1

    def test_edge_region_only_keeps_edge(self):
        f = CandidateFilter()
        # bbox near bottom edge (y=440 in 480-height frame, 15% = 72px)
        bboxes = [BBox(10, 440, 100, 30, 0.9)]
        result = f.filter(bboxes, frame_h=480, frame_w=640, min_area=0, edge_region_only=True)
        assert len(result) == 1

    def test_edge_region_only_removes_center(self):
        f = CandidateFilter()
        # bbox in center
        bboxes = [BBox(250, 200, 100, 50, 0.9)]
        result = f.filter(bboxes, frame_h=480, frame_w=640, min_area=0, edge_region_only=True)
        assert result == []


class TestTextDetectionSampler:
    def _make_detector_with_bboxes(self, bboxes):
        detector = EasyOCRDetector()
        mock_reader = _mock_reader([(b.x, b.y, b.w, b.h, b.conf) for b in bboxes])
        detector._reader = mock_reader
        return detector

    def test_sample_keyframes_interval(self):
        bboxes = [BBox(10, 10, 100, 30, 0.9)]
        detector = self._make_detector_with_bboxes(bboxes)
        sampler = TextDetectionSampler(detector, detect_interval=10)

        frames = [np.zeros((480, 640, 3), dtype=np.uint8)] * 30
        result = sampler.sample_keyframes(frames)

        # Only frames 0, 10, 20 should be in result
        assert set(result.keys()) == {0, 10, 20}

    def test_sample_empty_frames(self):
        detector = EasyOCRDetector()
        sampler = TextDetectionSampler(detector, detect_interval=10)
        result = sampler.sample_keyframes([])
        assert result == {}

    def test_non_key_frames_not_in_dict(self):
        detector = self._make_detector_with_bboxes([BBox(10, 10, 100, 30, 0.9)])
        sampler = TextDetectionSampler(detector, detect_interval=10)
        frames = [np.zeros((480, 640, 3), dtype=np.uint8)] * 30
        result = sampler.sample_keyframes(frames)
        assert 1 not in result
        assert 5 not in result
        assert 11 not in result
