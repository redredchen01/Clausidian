"""Unit 7: Watermark overlay tests"""
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from src.config import WatermarkConfig
from src.video.ffmpeg_utils import _position_to_expr, _enable_expr


class TestPositionToExpr:
    def test_bottom_right(self):
        x, y = _position_to_expr("bottom-right", margin=20)
        assert "W" in x and "w" in x
        assert "H" in y and "h" in y

    def test_top_left(self):
        x, y = _position_to_expr("top-left", margin=10)
        assert x == "10"
        assert y == "10"

    def test_center(self):
        x, y = _position_to_expr("center", margin=0)
        assert "W" in x and "H" in y


class TestEnableExpr:
    def test_both_set(self):
        expr = _enable_expr(1.0, 5.0)
        assert "between" in expr
        assert "1.0" in expr
        assert "5.0" in expr

    def test_start_only(self):
        expr = _enable_expr(2.0, None)
        assert "gte" in expr

    def test_end_only(self):
        expr = _enable_expr(None, 3.0)
        assert "lte" in expr

    def test_neither(self):
        assert _enable_expr(None, None) == "1"


class TestTextWatermark:
    def test_disabled_calls_remux(self, tmp_path):
        from src.watermark import text_watermark
        from src.video import ffmpeg_utils

        cfg = WatermarkConfig(enabled=False)
        with patch.object(ffmpeg_utils, "_run") as mock_run, \
             patch.object(ffmpeg_utils, "_require_ffmpeg", return_value="ffmpeg"):
            text_watermark.apply("in.mp4", "out.mp4", cfg)
            mock_run.assert_called_once()
            cmd = mock_run.call_args[0][0]
            # passthrough: no overlay filter, just libx264 + audio copy
            assert not any("drawtext" in str(c) for c in cmd)
            assert "-c:a" in cmd

    def test_enabled_calls_ffmpeg(self, tmp_path):
        from src.watermark import text_watermark
        from src.video import ffmpeg_utils

        cfg = WatermarkConfig(enabled=True, text="TEST", position="bottom-right")
        with patch.object(ffmpeg_utils, "_run") as mock_run, \
             patch.object(ffmpeg_utils, "_require_ffmpeg", return_value="ffmpeg"):
            text_watermark.apply("in.mp4", "out.mp4", cfg)
            mock_run.assert_called_once()
            # verify ffmpeg command contains drawtext
            cmd = mock_run.call_args[0][0]
            assert any("drawtext" in str(c) for c in cmd)


class TestImageWatermark:
    def test_missing_image_path_raises(self, tmp_path):
        from src.watermark import image_watermark
        cfg = WatermarkConfig(enabled=True, type="image", image_path=None)
        with pytest.raises(ValueError, match="image_path"):
            image_watermark.apply("in.mp4", "out.mp4", cfg)

    def test_disabled_calls_remux(self, tmp_path):
        from src.watermark import image_watermark
        from src.video import ffmpeg_utils

        cfg = WatermarkConfig(enabled=False, type="image")
        with patch.object(ffmpeg_utils, "_run") as mock_run, \
             patch.object(ffmpeg_utils, "_require_ffmpeg", return_value="ffmpeg"):
            image_watermark.apply("in.mp4", "out.mp4", cfg)
            mock_run.assert_called_once()
            cmd = mock_run.call_args[0][0]
            assert not any("overlay" in str(c) for c in cmd)
            assert "-c:a" in cmd
