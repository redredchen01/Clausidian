"""共用 fixtures"""
import numpy as np
import pytest


def make_frame(width: int = 640, height: int = 480, color: int = 128) -> np.ndarray:
    """返回純色 BGR 幀"""
    return np.full((height, width, 3), color, dtype=np.uint8)


def make_text_frame(
    text: str = "watermark",
    width: int = 640,
    height: int = 480,
) -> np.ndarray:
    """返回帶白色文字的 BGR 幀"""
    import cv2
    frame = make_frame(width, height, 80)
    cv2.putText(frame, text, (30, height - 30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
    return frame


@pytest.fixture
def blank_frame():
    return make_frame()


@pytest.fixture
def text_frame():
    return make_text_frame()


@pytest.fixture
def blank_frames():
    return [make_frame() for _ in range(10)]
