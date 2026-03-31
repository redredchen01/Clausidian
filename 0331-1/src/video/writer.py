"""Stage A: Video Writer"""
from __future__ import annotations

from pathlib import Path
from typing import List

import cv2
import numpy as np


class VideoWriter:
    @staticmethod
    def write_frames(
        frames: List[np.ndarray],
        path: str,
        fps: float,
        fourcc: str = "mp4v",
    ) -> None:
        if not frames:
            raise ValueError("frames list is empty")
        h, w = frames[0].shape[:2]
        out_path = Path(path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cc = cv2.VideoWriter_fourcc(*fourcc)
        writer = cv2.VideoWriter(str(out_path), cc, fps, (w, h))
        if not writer.isOpened():
            raise RuntimeError(f"Cannot open VideoWriter for: {path}")
        for frame in frames:
            writer.write(frame)
        writer.release()
