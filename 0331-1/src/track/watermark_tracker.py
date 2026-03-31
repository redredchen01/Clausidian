"""Stage C: WatermarkTracker — IoU + center-distance matching"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from src.detect.easyocr_detector import BBox


@dataclass
class Track:
    track_id: int
    bboxes: Dict[int, Optional[BBox]] = field(default_factory=dict)
    start_frame: int = 0
    end_frame: int = 0


def _iou(a: BBox, b: BBox) -> float:
    ax1, ay1, ax2, ay2 = a.x, a.y, a.x + a.w, a.y + a.h
    bx1, by1, bx2, by2 = b.x, b.y, b.x + b.w, b.y + b.h
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union > 0 else 0.0


def _center_dist(a: BBox, b: BBox) -> float:
    cx_a, cy_a = a.x + a.w / 2, a.y + a.h / 2
    cx_b, cy_b = b.x + b.w / 2, b.y + b.h / 2
    return ((cx_a - cx_b) ** 2 + (cy_a - cy_b) ** 2) ** 0.5


def _lerp_bbox(a: BBox, b: BBox, t: float) -> BBox:
    """線性插值兩個 BBox"""
    return BBox(
        x=int(a.x + (b.x - a.x) * t),
        y=int(a.y + (b.y - a.y) * t),
        w=int(a.w + (b.w - a.w) * t),
        h=int(a.h + (b.h - a.h) * t),
        conf=a.conf + (b.conf - a.conf) * t,
    )


class WatermarkTracker:
    def __init__(
        self,
        center_dist_threshold: float = 80.0,
        match_cost_threshold: float = 1.5,
        gap_tolerance: int = 5,
    ):
        self.center_dist_threshold = center_dist_threshold
        self.match_cost_threshold = match_cost_threshold
        self.gap_tolerance = gap_tolerance

    def track(
        self,
        detections: Dict[int, List[BBox]],
        total_frames: int,
    ) -> List[Track]:
        """從 key-frame detections 建立穩定 Track 列表"""
        if not detections:
            return []

        tracks: List[Track] = []
        next_id = 0
        # active_tracks: list of (track, last_seen_frame, last_bbox)
        active: List[tuple] = []

        key_frames = sorted(detections.keys())

        for frame_idx in key_frames:
            bboxes = detections[frame_idx]

            # Match each detection to existing tracks
            matched_tracks = set()
            matched_dets = set()

            # Combined cost matching: cost = (1 - iou) + center_dist / center_dist_threshold
            # Lower cost = better match; threshold on combined cost avoids spurious OR-merges
            candidates = []
            for ti, (track, last_frame, last_bbox) in enumerate(active):
                for di, bbox in enumerate(bboxes):
                    iou_val = _iou(last_bbox, bbox)
                    dist = _center_dist(last_bbox, bbox)
                    cost = (1.0 - iou_val) + dist / self.center_dist_threshold
                    if cost < self.match_cost_threshold:
                        candidates.append((cost, ti, di))

            candidates.sort(key=lambda x: x[0])
            for _cost, ti, di in candidates:
                if ti in matched_tracks or di in matched_dets:
                    continue

                track, last_frame, last_bbox = active[ti]
                gap = frame_idx - last_frame

                if gap > self.gap_tolerance:
                    # Gap too large — close old track, leave di unmatched for new track
                    track.end_frame = last_frame
                    active[ti] = (None, last_frame, last_bbox)
                    matched_tracks.add(ti)
                    # di intentionally NOT added to matched_dets → will create new track below
                    continue

                matched_tracks.add(ti)
                matched_dets.add(di)

                if 0 < gap <= self.gap_tolerance:
                    # Linear interpolation for missed frames
                    for g in range(1, gap):
                        t = g / gap
                        interp = _lerp_bbox(last_bbox, bboxes[di], t)
                        track.bboxes[last_frame + g] = interp

                track.bboxes[frame_idx] = bboxes[di]
                track.end_frame = frame_idx
                active[ti] = (track, frame_idx, bboxes[di])

            # Terminate tracks with gap > tolerance
            still_active = []
            for ti, (track, last_frame, last_bbox) in enumerate(active):
                if track is None:
                    continue
                if frame_idx - last_frame > self.gap_tolerance:
                    track.end_frame = last_frame
                else:
                    still_active.append((track, last_frame, last_bbox))
            active = still_active

            # New tracks for unmatched detections
            for di, bbox in enumerate(bboxes):
                if di not in matched_dets:
                    new_track = Track(
                        track_id=next_id,
                        bboxes={frame_idx: bbox},
                        start_frame=frame_idx,
                        end_frame=frame_idx,
                    )
                    tracks.append(new_track)
                    active.append((new_track, frame_idx, bbox))
                    next_id += 1

        # Close remaining active tracks
        for track, last_frame, _ in active:
            if track is not None:
                track.end_frame = last_frame

        return tracks
