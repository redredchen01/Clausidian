"""Stage B: EasyOCR-based text detector"""
from __future__ import annotations

from collections import namedtuple
from typing import List, Optional

import cv2
import numpy as np

BBox = namedtuple("BBox", ["x", "y", "w", "h", "conf"])


def _pad_clamp(x: int, y: int, w: int, h: int, pad: int, fw: int, fh: int) -> BBox:
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(fw, x + w + pad)
    y2 = min(fh, y + h + pad)
    return BBox(x=x1, y=y1, w=x2 - x1, h=y2 - y1, conf=0.0)


class EasyOCRDetector:
    def __init__(
        self,
        languages: Optional[List[str]] = None,
        gpu: bool = False,
        confidence_threshold: float = 0.3,
        bbox_padding: int = 6,
    ):
        self.languages = languages or ["ch_sim", "en"]
        self.gpu = gpu
        self.confidence_threshold = confidence_threshold
        self.bbox_padding = bbox_padding
        self._reader = None

    def _get_reader(self):
        if self._reader is None:
            try:
                import easyocr
            except ImportError:
                raise ImportError(
                    "easyocr not installed. Install it: pip install easyocr"
                )
            self._reader = easyocr.Reader(self.languages, gpu=self.gpu, verbose=False)
        return self._reader

    def detect(self, frame: np.ndarray) -> List[BBox]:
        reader = self._get_reader()
        fh, fw = frame.shape[:2]
        results = reader.readtext(frame, batch_size=4)
        bboxes = []
        for pts, text, conf in results:
            if conf < self.confidence_threshold:
                continue
            # pts: 4-point [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            xs = [int(p[0]) for p in pts]
            ys = [int(p[1]) for p in pts]
            x_min, x_max = min(xs), max(xs)
            y_min, y_max = min(ys), max(ys)
            x1 = max(0, x_min - self.bbox_padding)
            y1 = max(0, y_min - self.bbox_padding)
            x2 = min(fw, x_max + self.bbox_padding)
            y2 = min(fh, y_max + self.bbox_padding)
            bboxes.append(BBox(x=x1, y=y1, w=x2 - x1, h=y2 - y1, conf=conf))
        return bboxes
