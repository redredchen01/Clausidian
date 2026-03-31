"""Stage B: Detection sampler — samples key frames, fills non-key-frames with empty"""
from __future__ import annotations

from typing import Dict, List

import numpy as np

from src.detect.easyocr_detector import BBox, EasyOCRDetector
from src.detect.candidate_filter import CandidateFilter


class TextDetectionSampler:
    def __init__(
        self,
        detector: EasyOCRDetector,
        detect_interval: int = 10,
        candidate_filter: CandidateFilter | None = None,
        min_area: int = 200,
        edge_region_only: bool = False,
    ):
        if detect_interval < 1:
            raise ValueError(f"detect_interval must be >= 1, got {detect_interval}")
        self.detector = detector
        self.detect_interval = detect_interval
        self.candidate_filter = candidate_filter or CandidateFilter()
        self.min_area = min_area
        self.edge_region_only = edge_region_only

    def sample_keyframes(
        self, frames: List[np.ndarray]
    ) -> Dict[int, List[BBox]]:
        """偵測關鍵幀，返回 {frame_idx: [BBox]}；非關鍵幀不在 dict 中"""
        if not frames:
            return {}
        fh, fw = frames[0].shape[:2]
        result: Dict[int, List[BBox]] = {}
        total = len(frames)
        n_detected = 0

        for i in range(0, total, self.detect_interval):
            raw = self.detector.detect(frames[i])
            filtered = self.candidate_filter.filter(
                raw, fh, fw, self.min_area, self.edge_region_only
            )
            result[i] = filtered
            if filtered:
                n_detected += 1

        n_keys = len(result)
        print(
            f"Stage B: detected in {n_detected}/{n_keys} key frames"
            f" ({n_keys}/{total} sampled)"
        )
        if n_detected == 0:
            print(
                "WARNING: Stage B detected 0 frames. "
                "Check confidence_threshold or use hint_bbox."
            )
        return result
