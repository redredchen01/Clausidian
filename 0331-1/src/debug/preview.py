"""Debug: per-frame overlay utilities"""
from __future__ import annotations

from typing import List

import cv2
import numpy as np

from src.detect.easyocr_detector import BBox


def draw_detection_overlay(frame: np.ndarray, bboxes: List[BBox]) -> np.ndarray:
    out = frame.copy()
    for bbox in bboxes:
        x, y, w, h = bbox.x, bbox.y, bbox.w, bbox.h
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 255, 0), 2)
        label = f"{bbox.conf:.2f}"
        cv2.putText(out, label, (x, max(y - 4, 12)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    return out
