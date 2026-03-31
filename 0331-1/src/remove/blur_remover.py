"""Stage E: BlurRemover — gaussian blur with alpha-blend mask support"""
from __future__ import annotations

import cv2
import numpy as np


class BlurRemover:
    def __init__(self, blur_ksize: int = 51):
        if blur_ksize % 2 == 0:
            blur_ksize += 1
        self.blur_ksize = blur_ksize

    def remove(self, frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
        if mask.max() == 0:
            return frame.copy()
        blurred = cv2.GaussianBlur(frame, (self.blur_ksize, self.blur_ksize), 0)
        mask_f = mask.astype(np.float32) / 255.0
        result = (
            mask_f[..., None] * blurred + (1 - mask_f[..., None]) * frame
        ).astype(np.uint8)
        return result
