"""Stage C: TemporalSmoother — EMA smoothing on Track bbox sequences"""
from __future__ import annotations

import math
from typing import List

from src.detect.easyocr_detector import BBox
from src.track.watermark_tracker import Track


def _center_dist(a: BBox, b: BBox) -> float:
    cx_a, cy_a = a.x + a.w / 2, a.y + a.h / 2
    cx_b, cy_b = b.x + b.w / 2, b.y + b.h / 2
    return math.hypot(cx_a - cx_b, cy_a - cy_b)


class TemporalSmoother:
    def smooth(
        self,
        tracks: List[Track],
        alpha: float = 0.5,
        step_threshold: float = 50.0,
    ) -> List[Track]:
        """對每條 track 的 bbox 做 EMA 平滑；位移突變時跳過 EMA 防止拖影"""
        for track in tracks:
            if not track.bboxes:
                continue
            frame_idxs = sorted(track.bboxes.keys())
            prev: BBox | None = None
            for idx in frame_idxs:
                curr = track.bboxes[idx]
                if curr is None or prev is None:
                    if curr is not None:
                        prev = curr
                    continue
                # Step-change detector: 位移超過閾值時重置 EMA
                if _center_dist(prev, curr) > step_threshold:
                    track.bboxes[idx] = curr
                    prev = curr
                    continue
                smoothed = BBox(
                    x=int(alpha * curr.x + (1 - alpha) * prev.x),
                    y=int(alpha * curr.y + (1 - alpha) * prev.y),
                    w=int(alpha * curr.w + (1 - alpha) * prev.w),
                    h=int(alpha * curr.h + (1 - alpha) * prev.h),
                    conf=alpha * curr.conf + (1 - alpha) * prev.conf,
                )
                track.bboxes[idx] = smoothed
                prev = smoothed
        return tracks
