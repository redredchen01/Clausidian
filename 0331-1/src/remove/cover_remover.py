"""Stage E: SolidCoverRemover — fill with solid color"""
from __future__ import annotations

from typing import Tuple

import numpy as np


class SolidCoverRemover:
    def __init__(self, solid_color: Tuple[int, int, int] = (0, 0, 0)):
        self.solid_color = solid_color

    def remove(self, frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
        if mask.max() == 0:
            return frame.copy()
        solid = np.full_like(frame, self.solid_color)
        mask_f = mask.astype(np.float32) / 255.0
        result = (
            mask_f[..., None] * solid + (1 - mask_f[..., None]) * frame
        ).astype(np.uint8)
        return result
