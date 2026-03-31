"""Unit 8: Pipeline E2E Tests"""
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest

from src.config import PipelineConfig, WatermarkConfig
from src.detect.easyocr_detector import BBox
from src.pipeline.run_pipeline import PipelineMode, run_pipeline
from src.video.reader import VideoReader
from src.video.writer import VideoWriter


def _write_video(path: str, n: int = 5, fps: float = 25.0, text: str = "watermark"):
    frames = []
    for _ in range(n):
        f = np.full((240, 320, 3), 80, dtype=np.uint8)
        cv2.putText(f, text, (10, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1)
        frames.append(f)
    VideoWriter.write_frames(frames, path, fps)
    return frames


def _mock_detector_no_detection(monkeypatch):
    """Patch EasyOCRDetector.detect to return empty list"""
    from src.detect import easyocr_detector
    monkeypatch.setattr(easyocr_detector.EasyOCRDetector, "_get_reader", lambda self: None)
    monkeypatch.setattr(easyocr_detector.EasyOCRDetector, "detect", lambda self, frame: [])


def _mock_detector_with_bbox(monkeypatch, bbox: BBox):
    """Patch EasyOCRDetector.detect to return one fixed bbox"""
    from src.detect import easyocr_detector
    monkeypatch.setattr(easyocr_detector.EasyOCRDetector, "_get_reader", lambda self: None)
    monkeypatch.setattr(easyocr_detector.EasyOCRDetector, "detect", lambda self, frame: [bbox])


class TestRunPipelineOnlyDetect:
    def test_only_detect_no_output_video(self, tmp_path, monkeypatch):
        _mock_detector_no_detection(monkeypatch)
        inp = str(tmp_path / "in.mp4")
        out = str(tmp_path / "out.mp4")
        _write_video(inp)

        cfg = PipelineConfig()
        cfg.debug.enabled = True
        cfg.debug.output_dir = str(tmp_path / "debug")
        run_pipeline(cfg, inp, out, PipelineMode.ONLY_DETECT)
        # output video should NOT be created in ONLY_DETECT mode
        assert not Path(out).exists()


class TestRunPipelineOnlyRemove:
    def test_only_remove_creates_output(self, tmp_path, monkeypatch):
        _mock_detector_no_detection(monkeypatch)
        inp = str(tmp_path / "in.mp4")
        out = str(tmp_path / "out.mp4")
        _write_video(inp, n=5)

        cfg = PipelineConfig()
        run_pipeline(cfg, inp, out, PipelineMode.ONLY_REMOVE)
        assert Path(out).exists()
        meta = VideoReader.read_metadata(out)
        assert meta.frame_count == 5


class TestRunPipelineNoDetection:
    def test_zero_detections_outputs_same_content(self, tmp_path, monkeypatch):
        _mock_detector_no_detection(monkeypatch)
        inp = str(tmp_path / "in.mp4")
        out = str(tmp_path / "out.mp4")
        _write_video(inp, n=4)

        cfg = PipelineConfig()
        cfg.watermark.enabled = False
        run_pipeline(cfg, inp, out, PipelineMode.ONLY_REMOVE)
        assert Path(out).exists()
        meta = VideoReader.read_metadata(out)
        assert meta.frame_count == 4


class TestRunPipelineMissingInput:
    def test_missing_input_raises(self, tmp_path):
        cfg = PipelineConfig()
        with pytest.raises(FileNotFoundError):
            run_pipeline(cfg, "/nonexistent/video.mp4", str(tmp_path / "out.mp4"))


class TestDetectionCache:
    def test_detection_cache_loaded(self, tmp_path, monkeypatch):
        _mock_detector_no_detection(monkeypatch)
        inp = str(tmp_path / "in.mp4")
        out = str(tmp_path / "out.mp4")
        _write_video(inp, n=3)

        debug_dir = tmp_path / "debug"
        debug_dir.mkdir()
        # Pre-create cache with one detection at frame 0
        cache = {"0": [[10, 10, 50, 20, 0.9]]}
        (debug_dir / "detections.json").write_text(json.dumps(cache))

        cfg = PipelineConfig()
        cfg.debug.enabled = True
        cfg.debug.output_dir = str(debug_dir)
        cfg.watermark.enabled = False

        run_pipeline(cfg, inp, out, PipelineMode.ONLY_REMOVE)
        assert Path(out).exists()
