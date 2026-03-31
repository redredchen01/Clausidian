"""Stage A: Video Reader"""
from __future__ import annotations

import shutil
from collections import namedtuple
from pathlib import Path
from typing import Generator, List, Optional

import cv2
import numpy as np

VideoMeta = namedtuple("VideoMeta", ["fps", "width", "height", "frame_count", "duration_sec"])


class VideoReader:
    @staticmethod
    def read_metadata(path: str) -> VideoMeta:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Video not found: {path}")
        cap = cv2.VideoCapture(str(p))
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {path}")
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = frame_count / fps if fps > 0 else 0.0
        cap.release()
        return VideoMeta(fps=fps, width=width, height=height,
                         frame_count=frame_count, duration_sec=duration_sec)

    @staticmethod
    def iter_frames(path: str) -> Generator[np.ndarray, None, None]:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Video not found: {path}")
        cap = cv2.VideoCapture(str(p))
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {path}")
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                yield frame
        finally:
            cap.release()

    @staticmethod
    def read_frames(
        path: str,
        start_sec: Optional[float] = None,
        end_sec: Optional[float] = None,
    ) -> List[np.ndarray]:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Video not found: {path}")
        cap = cv2.VideoCapture(str(p))
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total / fps

        start_frame = int((start_sec or 0) * fps)
        end_frame = int((end_sec or duration) * fps)

        # start_sec beyond duration → empty list
        if start_frame >= total:
            cap.release()
            return []

        end_frame = min(end_frame, total)

        # Pre-flight RAM check: frame_count × width × height × 3 channels
        n_frames = end_frame - start_frame
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        estimated_bytes = n_frames * width * height * 3
        _4GB = 4 * 1024 ** 3
        if estimated_bytes > _4GB:
            cap.release()
            raise MemoryError(
                f"Loading {n_frames} frames ({width}x{height}) would require "
                f"~{estimated_bytes / 1024**3:.1f}GB RAM (limit: 4GB). "
                f"Use start_sec/end_sec to process a shorter segment."
            )

        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        frames = []
        for _ in range(end_frame - start_frame):
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)
        cap.release()
        return frames
