"""Unit 5: MaskBuilder + MaskRender Tests"""
import tempfile
from pathlib import Path

import numpy as np
import pytest

from src.detect.easyocr_detector import BBox
from src.mask.mask_builder import MaskBuilder
from src.mask.mask_render import MaskRender
from src.track.watermark_tracker import Track
from src.video.reader import VideoReader


def _track_with_bbox(frame_idx: int, bbox: BBox) -> Track:
    t = Track(track_id=0, start_frame=frame_idx, end_frame=frame_idx)
    t.bboxes = {frame_idx: bbox}
    return t


class TestMaskBuilder:
    def test_single_track_mask(self):
        builder = MaskBuilder()
        bbox = BBox(10, 10, 50, 50, 0.9)
        track = _track_with_bbox(0, bbox)
        masks = builder.build([track], frame_h=100, frame_w=100, total_frames=5)

        assert len(masks) == 5
        # frame 0 should have 255 in bbox region
        assert masks[0][10:60, 10:60].min() == 255
        # frame 1 should be blank
        assert masks[1].max() == 0

    def test_expand_px(self):
        builder = MaskBuilder()
        bbox = BBox(20, 20, 30, 30, 0.9)
        track = _track_with_bbox(0, bbox)
        masks = builder.build([track], frame_h=100, frame_w=100, total_frames=1, expand_px=5)
        # expanded region: x=[15:55], y=[15:55]
        assert masks[0][15, 15] == 255
        assert masks[0][19, 19] == 255  # in expanded area

    def test_expand_px_clamped_to_frame(self):
        builder = MaskBuilder()
        bbox = BBox(2, 2, 10, 10, 0.9)  # near edge, expand=10 would go negative
        track = _track_with_bbox(0, bbox)
        masks = builder.build([track], frame_h=50, frame_w=50, total_frames=1, expand_px=10)
        # should not raise, mask stays in bounds
        assert masks[0].shape == (50, 50)

    def test_feather_radius_softens_edge(self):
        builder = MaskBuilder()
        bbox = BBox(20, 20, 40, 40, 0.9)
        track = _track_with_bbox(0, bbox)
        masks = builder.build([track], frame_h=100, frame_w=100, total_frames=1, expand_px=0, feather_radius=3)
        # With feathering (expand_px=0), boundary is hard; just outside the bbox
        # the blur should produce values between 0 and 255 (not hard edge)
        # bbox y=[20:60], x=[20:60] with no expand — pixel at [19,30] should be feathered
        assert 0 < masks[0][19, 30] < 255

    def test_empty_track_list(self):
        builder = MaskBuilder()
        masks = builder.build([], frame_h=100, frame_w=100, total_frames=5)
        for m in masks:
            assert m.max() == 0


class TestMaskRender:
    def test_overlay_shape_preserved(self):
        frames = [np.zeros((480, 640, 3), dtype=np.uint8) for _ in range(3)]
        masks = [np.zeros((480, 640), dtype=np.uint8) for _ in range(3)]
        masks[0][100:200, 100:200] = 255

        result = MaskRender.overlay_on_frames(frames, masks)
        assert len(result) == 3
        assert result[0].shape == (480, 640, 3)

    def test_export_mask_video(self, tmp_path):
        masks = [np.zeros((480, 640), dtype=np.uint8) for _ in range(5)]
        masks[0][50:100, 50:100] = 255
        out = str(tmp_path / "mask.mp4")
        MaskRender.export_mask_video(masks, out, fps=25.0)
        meta = VideoReader.read_metadata(out)
        assert meta.frame_count == 5
