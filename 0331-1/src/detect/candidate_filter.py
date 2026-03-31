"""Stage B: Candidate filter — removes noise bboxes"""
from __future__ import annotations

from typing import List

from src.detect.easyocr_detector import BBox


class CandidateFilter:
    def filter(
        self,
        detections: List[BBox],
        frame_h: int,
        frame_w: int,
        min_area: int = 200,
        edge_region_only: bool = False,
        edge_ratio: float = 0.15,
    ) -> List[BBox]:
        result = []
        for bbox in detections:
            if bbox.w * bbox.h < min_area:
                continue
            if edge_region_only:
                edge_x = frame_w * edge_ratio
                edge_y = frame_h * edge_ratio
                in_edge = (
                    bbox.x < edge_x
                    or bbox.x + bbox.w > frame_w - edge_x
                    or bbox.y < edge_y
                    or bbox.y + bbox.h > frame_h - edge_y
                )
                if not in_edge:
                    continue
            result.append(bbox)
        return result
