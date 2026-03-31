"""Unit 2: Video IO Tests"""
import shutil
import tempfile
from pathlib import Path

import cv2
import numpy as np
import pytest

from src.video.reader import VideoMeta, VideoReader
from src.video.writer import VideoWriter


def _write_synthetic_video(path: str, n_frames: int = 10, fps: float = 25.0):
    frames = [np.zeros((480, 640, 3), dtype=np.uint8) for _ in range(n_frames)]
    # Add frame index as pixel value so frames are distinguishable
    for i, f in enumerate(frames):
        f[:, :] = i
    VideoWriter.write_frames(frames, path, fps)
    return frames


class TestVideoMeta:
    def test_read_metadata(self, tmp_path):
        p = str(tmp_path / "test.mp4")
        _write_synthetic_video(p, n_frames=10, fps=25.0)
        meta = VideoReader.read_metadata(p)
        assert isinstance(meta, VideoMeta)
        assert meta.width == 640
        assert meta.height == 480
        assert meta.frame_count == 10

    def test_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            VideoReader.read_metadata("/nonexistent/video.mp4")


class TestReadFrames:
    def test_read_all_frames(self, tmp_path):
        p = str(tmp_path / "test.mp4")
        _write_synthetic_video(p, n_frames=10)
        frames = VideoReader.read_frames(p)
        assert len(frames) == 10
        assert frames[0].shape == (480, 640, 3)

    def test_read_frames_start_beyond_duration(self, tmp_path):
        p = str(tmp_path / "test.mp4")
        _write_synthetic_video(p, n_frames=10, fps=25.0)
        # start_sec=1000 >> duration
        frames = VideoReader.read_frames(p, start_sec=1000.0)
        assert frames == []

    def test_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            VideoReader.read_frames("/nonexistent.mp4")

    def test_iter_frames(self, tmp_path):
        p = str(tmp_path / "test.mp4")
        _write_synthetic_video(p, n_frames=5)
        frames = list(VideoReader.iter_frames(p))
        assert len(frames) == 5


class TestRAMCheck:
    def test_oversized_video_raises_memory_error(self, tmp_path, monkeypatch):
        """Pre-flight check: frame_count×w×h×3 > 4GB raises MemoryError"""
        p = str(tmp_path / "big.mp4")
        # Write a real tiny video so read_metadata + read_frames can open it
        import numpy as np
        from src.video.writer import VideoWriter
        VideoWriter.write_frames([np.zeros((240, 320, 3), dtype=np.uint8)] * 3, p, 25.0)

        # Patch read_metadata to report a giant resolution that triggers the check
        from src.video import reader as reader_mod
        real_read_metadata = reader_mod.VideoReader.read_metadata

        def fake_read_metadata(path):
            return reader_mod.VideoMeta(fps=25.0, width=3840, height=2160,
                                        frame_count=10000, duration_sec=400.0)

        monkeypatch.setattr(reader_mod.VideoReader, "read_metadata", staticmethod(fake_read_metadata))

        import cv2
        # Also patch VideoCapture to return large dimensions
        class FakeCap:
            def isOpened(self): return True
            def get(self, prop):
                import cv2 as _cv2
                if prop == _cv2.CAP_PROP_FPS: return 25.0
                if prop == _cv2.CAP_PROP_FRAME_COUNT: return 10000
                if prop == _cv2.CAP_PROP_FRAME_WIDTH: return 3840
                if prop == _cv2.CAP_PROP_FRAME_HEIGHT: return 2160
                return 0
            def set(self, *a): pass
            def read(self): return False, None
            def release(self): pass

        monkeypatch.setattr(cv2, "VideoCapture", lambda _: FakeCap())

        with pytest.raises(MemoryError, match="4GB"):
            VideoReader.read_frames(p)


class TestVideoWriter:
    def test_write_and_read_roundtrip(self, tmp_path):
        p = str(tmp_path / "out.mp4")
        frames = [np.zeros((480, 640, 3), dtype=np.uint8) for _ in range(8)]
        VideoWriter.write_frames(frames, p, fps=25.0)
        assert Path(p).exists()
        meta = VideoReader.read_metadata(p)
        assert meta.frame_count == 8
        assert meta.width == 640
        assert meta.height == 480

    def test_empty_frames_raises(self, tmp_path):
        p = str(tmp_path / "out.mp4")
        with pytest.raises(ValueError):
            VideoWriter.write_frames([], p, fps=25.0)


class TestFFmpegUtils:
    def test_ffmpeg_not_in_path(self, monkeypatch):
        monkeypatch.setattr("shutil.which", lambda _: None)
        from src.video import ffmpeg_utils
        monkeypatch.setattr(ffmpeg_utils, "_require_ffmpeg", lambda: (_ for _ in ()).throw(RuntimeError("ffmpeg not found")))
        with pytest.raises(RuntimeError, match="ffmpeg"):
            ffmpeg_utils.add_watermark_text("in.mp4", "out.mp4", "test")
