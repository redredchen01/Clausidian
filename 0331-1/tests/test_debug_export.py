"""Unit 9: Debug Export Tests"""
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from src.debug.export_debug_video import (
    export_comparison_video,
    export_detection_video,
    export_mask_video,
    export_stage_log,
)
from src.debug.preview import draw_detection_overlay
from src.detect.easyocr_detector import BBox
from src.video.reader import VideoReader


def _frames(n=5, h=480, w=640):
    return [np.zeros((h, w, 3), dtype=np.uint8) for _ in range(n)]


class TestDrawDetectionOverlay:
    def test_returns_same_shape(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bboxes = [BBox(10, 10, 100, 30, 0.9)]
        result = draw_detection_overlay(frame, bboxes)
        assert result.shape == frame.shape

    def test_adds_rectangle(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bboxes = [BBox(10, 10, 100, 30, 0.9)]
        result = draw_detection_overlay(frame, bboxes)
        # Green channel should have some non-zero pixels (rectangle)
        assert result[:, :, 1].max() > 0

    def test_no_bboxes_unchanged(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        result = draw_detection_overlay(frame, [])
        assert np.array_equal(result, frame)


class TestExportDetectionVideo:
    def test_output_file_created(self, tmp_path):
        frames = _frames(5)
        detections = {0: [BBox(10, 10, 50, 20, 0.9)], 2: []}
        out = str(tmp_path / "det.mp4")
        export_detection_video(frames, detections, out, fps=25.0)
        assert Path(out).exists()


class TestExportMaskVideo:
    def test_output_file_created(self, tmp_path):
        masks = [np.zeros((480, 640), dtype=np.uint8) for _ in range(5)]
        out = str(tmp_path / "mask.mp4")
        export_mask_video(masks, out, fps=25.0)
        assert Path(out).exists()


class TestExportComparisonVideo:
    def test_output_width_doubled(self, tmp_path):
        orig = _frames(5)
        clean = _frames(5)
        out = str(tmp_path / "cmp.mp4")
        export_comparison_video(orig, clean, out, fps=25.0)
        meta = VideoReader.read_metadata(out)
        assert meta.width == 640 * 2

    def test_output_frame_count(self, tmp_path):
        orig = _frames(4)
        clean = _frames(4)
        out = str(tmp_path / "cmp.mp4")
        export_comparison_video(orig, clean, out, fps=25.0)
        meta = VideoReader.read_metadata(out)
        assert meta.frame_count == 4


class TestExportStageLog:
    def test_creates_json_file(self, tmp_path):
        log_path = str(tmp_path / "logs" / "stage_b.json")
        export_stage_log("stage_b", {"detected": 5, "total": 10}, log_path)
        assert Path(log_path).exists()
        data = json.loads(Path(log_path).read_text())
        assert data["stage"] == "stage_b"
        assert data["detected"] == 5
