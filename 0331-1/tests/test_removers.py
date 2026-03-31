"""Unit 6: Removers Tests"""
import numpy as np
import pytest

from src.remove.blur_remover import BlurRemover
from src.remove.cover_remover import SolidCoverRemover


def _frame(h=100, w=100, color=128):
    return np.full((h, w, 3), color, dtype=np.uint8)


def _mask_full(h=100, w=100):
    return np.full((h, w), 255, dtype=np.uint8)


def _mask_zero(h=100, w=100):
    return np.zeros((h, w), dtype=np.uint8)


def _mask_region(y1, y2, x1, x2, h=100, w=100):
    m = np.zeros((h, w), dtype=np.uint8)
    m[y1:y2, x1:x2] = 255
    return m


class TestBlurRemover:
    def test_mask_region_is_blurred(self):
        remover = BlurRemover(blur_ksize=51)
        frame = _frame(100, 100, 128)
        # Add a bright rectangle so blur changes values
        frame[30:70, 30:70] = 200
        mask = _mask_region(30, 70, 30, 70)
        result = remover.remove(frame, mask)
        # Pixels in mask region should differ from original
        assert not np.array_equal(result[30:70, 30:70], frame[30:70, 30:70])

    def test_non_mask_region_unchanged(self):
        remover = BlurRemover(blur_ksize=51)
        frame = _frame()
        mask = _mask_region(10, 30, 10, 30)
        result = remover.remove(frame, mask)
        # Outside mask region should be pixel-identical
        assert np.array_equal(result[50:80, 50:80], frame[50:80, 50:80])

    def test_zero_mask_returns_copy(self):
        remover = BlurRemover(blur_ksize=51)
        frame = _frame()
        mask = _mask_zero()
        result = remover.remove(frame, mask)
        assert np.array_equal(result, frame)

    def test_full_mask_entire_frame_blurred(self):
        remover = BlurRemover(blur_ksize=51)
        frame = _frame()
        mask = _mask_full()
        result = remover.remove(frame, mask)
        assert result.shape == frame.shape

    def test_output_shape_preserved(self):
        remover = BlurRemover(blur_ksize=21)
        frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        mask = _mask_region(100, 200, 100, 300, 480, 640)
        result = remover.remove(frame, mask)
        assert result.shape == frame.shape


class TestSolidCoverRemover:
    def test_mask_region_is_solid_color(self):
        remover = SolidCoverRemover(solid_color=(0, 0, 0))
        frame = _frame(100, 100, 200)
        mask = _mask_full()
        result = remover.remove(frame, mask)
        assert np.all(result == 0)

    def test_non_mask_region_unchanged(self):
        remover = SolidCoverRemover(solid_color=(0, 255, 0))
        frame = _frame(100, 100, 100)
        mask = _mask_region(0, 50, 0, 100)
        result = remover.remove(frame, mask)
        assert np.array_equal(result[60:80, :], frame[60:80, :])

    def test_zero_mask_returns_copy(self):
        remover = SolidCoverRemover()
        frame = _frame()
        mask = _mask_zero()
        result = remover.remove(frame, mask)
        assert np.array_equal(result, frame)

    def test_custom_solid_color(self):
        remover = SolidCoverRemover(solid_color=(255, 0, 0))
        frame = _frame()
        mask = _mask_full()
        result = remover.remove(frame, mask)
        assert np.all(result[:, :, 0] == 255)
        assert np.all(result[:, :, 1] == 0)
        assert np.all(result[:, :, 2] == 0)
