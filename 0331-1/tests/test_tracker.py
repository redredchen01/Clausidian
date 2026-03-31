"""Unit 4: Tracker + Smoother Tests"""
import pytest

from src.detect.easyocr_detector import BBox
from src.track.temporal_smoother import TemporalSmoother
from src.track.watermark_tracker import Track, WatermarkTracker


class TestWatermarkTracker:
    def _tracker(self, **kwargs):
        defaults = dict(center_dist_threshold=80.0, match_cost_threshold=1.5, gap_tolerance=2)
        defaults.update(kwargs)
        return WatermarkTracker(**defaults)

    def test_empty_detections_returns_empty(self):
        t = self._tracker()
        assert t.track(detections={}, total_frames=10) == []

    def test_single_detection_creates_one_track(self):
        t = self._tracker()
        detections = {0: [BBox(10, 10, 100, 30, 0.9)]}
        tracks = t.track(detections, total_frames=10)
        assert len(tracks) == 1
        assert 0 in tracks[0].bboxes

    def test_two_separate_bboxes_create_two_tracks(self):
        t = self._tracker()
        # Two spatially separated bboxes in same frame → two tracks
        detections = {
            0: [BBox(10, 10, 50, 20, 0.9), BBox(400, 400, 50, 20, 0.9)],
        }
        tracks = t.track(detections, total_frames=10)
        assert len(tracks) == 2

    def test_two_tracks_continue_with_gap_within_tolerance(self):
        t = self._tracker(gap_tolerance=5)
        detections = {
            0: [BBox(10, 10, 50, 20, 0.9), BBox(400, 400, 50, 20, 0.9)],
            2: [BBox(12, 10, 50, 20, 0.9), BBox(402, 400, 50, 20, 0.9)],
        }
        tracks = t.track(detections, total_frames=10)
        assert len(tracks) == 2

    def test_gap_within_tolerance_interpolates(self):
        t = self._tracker(gap_tolerance=3)
        # frame 0 and frame 4 detected (gap=4 but tolerance=3... let's use gap=2)
        detections = {
            0: [BBox(10, 10, 100, 30, 0.9)],
            2: [BBox(20, 10, 100, 30, 0.9)],  # gap=2, tolerance=3
        }
        tracks = t.track(detections, total_frames=10)
        assert len(tracks) == 1
        # frame 1 should be interpolated
        assert 1 in tracks[0].bboxes

    def test_gap_exceeds_tolerance_creates_two_tracks(self):
        t = self._tracker(gap_tolerance=1)
        # gap=5 >> tolerance=1
        detections = {
            0: [BBox(10, 10, 100, 30, 0.9)],
            5: [BBox(10, 10, 100, 30, 0.9)],
        }
        tracks = t.track(detections, total_frames=10)
        # Should create 2 separate tracks
        assert len(tracks) == 2


    def test_combined_cost_prevents_wrong_merge(self):
        """Two spatially distant bboxes should NOT be merged even if IoU is low"""
        # bbox A at top-left, bbox B at bottom-right — center distance >> threshold
        t = self._tracker(center_dist_threshold=50.0, match_cost_threshold=1.5)
        bbox_a = BBox(10, 10, 30, 30, 0.9)   # top-left
        bbox_b = BBox(500, 500, 30, 30, 0.9)  # far away (dist ≈ 693)
        detections = {
            0: [bbox_a],
            1: [bbox_b],  # large jump
        }
        tracks = t.track(detections, total_frames=5)
        # With combined cost, high center_dist pushes cost > threshold → 2 tracks
        assert len(tracks) == 2


class TestTemporalSmoother:
    def test_smooth_reduces_jitter(self):
        smoother = TemporalSmoother()
        # x alternates between 10 and 20 — EMA should converge
        track = Track(track_id=0, start_frame=0, end_frame=3)
        track.bboxes = {
            0: BBox(10, 100, 50, 20, 0.9),
            1: BBox(20, 100, 50, 20, 0.9),
            2: BBox(10, 100, 50, 20, 0.9),
            3: BBox(20, 100, 50, 20, 0.9),
        }
        [result] = smoother.smooth([track], alpha=0.5)
        # After EMA, x[1] = 0.5*20 + 0.5*10 = 15 (reduced from 20)
        assert result.bboxes[1].x == 15

    def test_step_change_skips_ema(self):
        """A sudden large position jump should bypass EMA (no lag/ghosting)"""
        smoother = TemporalSmoother()
        track = Track(track_id=0, start_frame=0, end_frame=1)
        track.bboxes = {
            0: BBox(10, 10, 50, 20, 0.9),
            1: BBox(500, 500, 50, 20, 0.9),  # center dist ≈ 693 >> step_threshold=50
        }
        [result] = smoother.smooth([track], alpha=0.5, step_threshold=50.0)
        # Frame 1 should keep exact value (no EMA blend)
        assert result.bboxes[1].x == 500
        assert result.bboxes[1].y == 500

    def test_empty_track_list(self):
        smoother = TemporalSmoother()
        result = smoother.smooth([], alpha=0.5)
        assert result == []

    def test_single_frame_track_unchanged(self):
        smoother = TemporalSmoother()
        track = Track(track_id=0, start_frame=0, end_frame=0)
        track.bboxes = {0: BBox(10, 10, 50, 20, 0.9)}
        [result] = smoother.smooth([track], alpha=0.5)
        assert result.bboxes[0].x == 10
