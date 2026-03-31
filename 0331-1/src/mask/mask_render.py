"""Stage D: MaskRender — debug visualization utilities"""
from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

from src.video.writer import VideoWriter


class MaskRender:
    @staticmethod
    def overlay_on_frames(
        frames: List[np.ndarray],
        masks: List[np.ndarray],
        color: Tuple[int, int, int] = (0, 255, 0),
        alpha: float = 0.4,
    ) -> List[np.ndarray]:
        result = []
        for frame, mask in zip(frames, masks):
            overlay = frame.copy()
            region = mask > 0
            colored = np.zeros_like(frame)
            colored[region] = color
            blended = cv2.addWeighted(overlay, 1.0, colored, alpha, 0)
            result.append(blended)
        return result

    @staticmethod
    def export_mask_video(
        masks: List[np.ndarray],
        output_path: str,
        fps: float,
    ) -> None:
        # Convert grayscale masks to BGR for VideoWriter
        bgr_masks = [cv2.cvtColor(m, cv2.COLOR_GRAY2BGR) for m in masks]
        VideoWriter.write_frames(bgr_masks, output_path, fps)
