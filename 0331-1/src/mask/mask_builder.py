"""Stage D: MaskBuilder — from Track list to per-frame masks"""
from __future__ import annotations

from typing import List, Optional

import cv2
import numpy as np

from src.track.watermark_tracker import Track


class MaskBuilder:
    def build(
        self,
        tracks: List[Track],
        frame_h: int,
        frame_w: int,
        total_frames: int,
        expand_px: int = 4,
        feather_radius: int = 0,
    ) -> List[np.ndarray]:
        masks = [np.zeros((frame_h, frame_w), dtype=np.uint8) for _ in range(total_frames)]

        for track in tracks:
            for frame_idx, bbox in track.bboxes.items():
                if bbox is None or frame_idx < 0 or frame_idx >= total_frames:
                    continue
                x1 = max(0, bbox.x - expand_px)
                y1 = max(0, bbox.y - expand_px)
                x2 = min(frame_w, bbox.x + bbox.w + expand_px)
                y2 = min(frame_h, bbox.y + bbox.h + expand_px)
                masks[frame_idx][y1:y2, x1:x2] = 255

        if feather_radius > 0:
            # kernel size must be odd
            kr = feather_radius * 2 + 1
            masks = [
                cv2.GaussianBlur(m, (kr, kr), feather_radius) for m in masks
            ]

        return masks
