"""Debug: export per-stage debug videos and logs"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List, Optional

import cv2
import numpy as np

from src.debug.preview import draw_detection_overlay
from src.detect.easyocr_detector import BBox
from src.video.writer import VideoWriter


def export_detection_video(
    frames: List[np.ndarray],
    detections: Dict[int, List[BBox]],
    output_path: str,
    fps: float,
) -> None:
    out_frames = []
    for i, frame in enumerate(frames):
        bboxes = detections.get(i, [])
        out_frames.append(draw_detection_overlay(frame, bboxes))
    VideoWriter.write_frames(out_frames, output_path, fps)


def export_mask_video(
    masks: List[np.ndarray],
    output_path: str,
    fps: float,
) -> None:
    bgr = [cv2.cvtColor(m, cv2.COLOR_GRAY2BGR) for m in masks]
    VideoWriter.write_frames(bgr, output_path, fps)


def export_comparison_video(
    original_frames: List[np.ndarray],
    cleaned_frames: List[np.ndarray],
    output_path: str,
    fps: float,
) -> None:
    out_frames = []
    for orig, clean in zip(original_frames, cleaned_frames):
        combined = np.concatenate([orig, clean], axis=1)
        out_frames.append(combined)
    VideoWriter.write_frames(out_frames, output_path, fps)


def export_stage_log(
    stage_name: str,
    stats: dict,
    log_path: str,
) -> None:
    data = {"stage": stage_name, "timestamp": time.time(), **stats}
    Path(log_path).parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "w") as f:
        json.dump(data, f, indent=2)
