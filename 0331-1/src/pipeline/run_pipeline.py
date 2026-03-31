"""
Pipeline Orchestrator — Stage A → B → C → D → E → F
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from enum import Enum
from pathlib import Path
from typing import List

import numpy as np
from tqdm import tqdm

from src.config import PipelineConfig
from src.detect.candidate_filter import CandidateFilter
from src.detect.detection_sampler import TextDetectionSampler
from src.detect.easyocr_detector import EasyOCRDetector
from src.mask.mask_builder import MaskBuilder
from src.mask.mask_render import MaskRender
from src.remove.blur_remover import BlurRemover
from src.remove.cover_remover import SolidCoverRemover
from src.track.temporal_smoother import TemporalSmoother
from src.track.watermark_tracker import WatermarkTracker
from src.video.reader import VideoReader
from src.video.writer import VideoWriter
import src.watermark.text_watermark as text_wm
import src.watermark.image_watermark as image_wm


class PipelineMode(Enum):
    FULL = "full"
    ONLY_DETECT = "only_detect"
    ONLY_MASK = "only_mask"
    ONLY_REMOVE = "only_remove"


def run_pipeline(
    cfg: PipelineConfig,
    input_path: str,
    output_path: str,
    mode: PipelineMode = PipelineMode.FULL,
) -> None:
    debug_dir = Path(cfg.debug.output_dir) if cfg.debug.enabled else None
    if debug_dir:
        debug_dir.mkdir(parents=True, exist_ok=True)

    # Stage A: Load frames
    print(f"▶ Stage A: Loading video: {input_path}")
    frames = VideoReader.read_frames(input_path, cfg.input.start_sec, cfg.input.end_sec)
    if not frames:
        raise RuntimeError(f"No frames loaded from {input_path}")
    fps = VideoReader.read_metadata(input_path).fps
    total = len(frames)
    fh, fw = frames[0].shape[:2]
    print(f"  Loaded {total} frames ({fw}x{fh} @ {fps:.1f}fps)")

    # Stage B: EasyOCR detection (with manifest-based cache invalidation)
    detections = _load_or_detect(frames, cfg, input_path, debug_dir)

    if mode == PipelineMode.ONLY_DETECT:
        if debug_dir:
            from src.debug.export_debug_video import export_detection_video
            export_detection_video(frames, detections, str(debug_dir / "detection_overlay.mp4"), fps)
            print(f"  Debug video → {debug_dir}/detection_overlay.mp4")
        return

    # Stage C: Track + smooth
    print("▶ Stage C: Tracking + smoothing...")
    tracker = WatermarkTracker(
        center_dist_threshold=cfg.tracking.center_dist_threshold,
        match_cost_threshold=cfg.tracking.match_cost_threshold,
        gap_tolerance=cfg.tracking.gap_tolerance,
    )
    tracks = tracker.track(detections, total)
    smoother = TemporalSmoother()
    tracks = smoother.smooth(
        tracks,
        alpha=cfg.tracking.ema_alpha,
        step_threshold=cfg.tracking.step_threshold,
    )
    print(f"  {len(tracks)} tracks found")

    # Stage D: Build masks
    print("▶ Stage D: Building masks...")
    builder = MaskBuilder()
    masks = builder.build(
        tracks, fh, fw, total,
        expand_px=cfg.mask.expand_px,
        feather_radius=cfg.mask.feather_radius,
    )
    if mode == PipelineMode.ONLY_MASK:
        if debug_dir:
            from src.debug.export_debug_video import export_mask_video
            export_mask_video(masks, str(debug_dir / "mask_preview.mp4"), fps)
        return

    # Stage E: Remove watermark
    print(f"▶ Stage E: Removing ({cfg.remove.strategy})...")
    cleaned_frames = _apply_removal(frames, masks, cfg)

    if debug_dir:
        from src.debug.export_debug_video import export_comparison_video, export_stage_log
        export_comparison_video(frames, cleaned_frames, str(debug_dir / "removed_preview.mp4"), fps)
        export_stage_log("stage_e", {"n_frames": total, "strategy": cfg.remove.strategy},
                         str(debug_dir / "stage_e.json"))

    if mode == PipelineMode.ONLY_REMOVE:
        VideoWriter.write_frames(cleaned_frames, output_path, fps)
        return

    # FULL mode: Stage F — watermark overlay via ffmpeg
    stem = Path(output_path).stem
    tmp_path = str(Path(output_path).parent / f"{stem}_cleaned_tmp.mp4")
    print("▶ Stage F: Adding watermark...")
    try:
        VideoWriter.write_frames(cleaned_frames, tmp_path, fps)
        _apply_watermark(tmp_path, output_path, cfg)
    finally:
        if Path(tmp_path).exists():
            os.remove(tmp_path)

    print(f"✅ Done → {output_path}")


def _detection_config_hash(cfg) -> str:
    """SHA-256 hash of detection config for cache invalidation"""
    payload = json.dumps(cfg.detection.model_dump(), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:8]


def _is_cache_valid(input_path: str, manifest_path: Path, config_hash: str) -> bool:
    if not manifest_path.exists():
        return False
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
        return (
            manifest.get("input_path") == str(input_path)
            and manifest.get("input_mtime") == os.path.getmtime(input_path)
            and manifest.get("config_hash") == config_hash
        )
    except Exception:
        return False


def _load_or_detect(frames, cfg, input_path: str, debug_dir):
    from src.detect.easyocr_detector import BBox

    cache_path = debug_dir / "detections.json" if debug_dir else None
    manifest_path = debug_dir / "detections_manifest.json" if debug_dir else None
    config_hash = _detection_config_hash(cfg)

    if cache_path and _is_cache_valid(input_path, manifest_path, config_hash):
        print(f"▶ Stage B: Loading detection cache from {cache_path}")
        with open(cache_path) as f:
            raw = json.load(f)
        return {int(k): [BBox(*b) for b in v] for k, v in raw.items()}

    print("▶ Stage B: Running EasyOCR detection...")
    detector = EasyOCRDetector(
        gpu=False,
        confidence_threshold=cfg.detection.confidence_threshold,
        bbox_padding=cfg.detection.bbox_padding,
    )
    sampler = TextDetectionSampler(
        detector=detector,
        detect_interval=cfg.detection.detect_interval,
        min_area=cfg.detection.min_area,
        edge_region_only=cfg.detection.edge_region_only,
    )
    detections = sampler.sample_keyframes(frames)

    if cache_path and debug_dir:
        debug_dir.mkdir(parents=True, exist_ok=True)
        # Write BBox cache: {"frame_idx_str": [[x, y, w, h, conf], ...]}
        with open(cache_path, "w") as f:
            json.dump(
                {str(k): [list(b) for b in v] for k, v in detections.items()},
                f, indent=2,
            )
        # Write invalidation manifest
        with open(manifest_path, "w") as f:
            json.dump({
                "input_path": str(input_path),
                "input_mtime": os.path.getmtime(input_path),
                "config_hash": config_hash,
            }, f, indent=2)

    return detections


def _apply_removal(frames, masks, cfg):
    strategy = cfg.remove.strategy
    if strategy == "gaussian_blur":
        remover = BlurRemover(blur_ksize=cfg.remove.blur_ksize)
    elif strategy == "solid":
        remover = SolidCoverRemover(solid_color=tuple(cfg.remove.solid_color))
    else:
        raise NotImplementedError(
            f"Strategy '{strategy}' not supported in frame-by-frame pipeline. "
            f"Use 'delogo' via CLI --cover-strategy for static positions."
        )
    return [remover.remove(f, m) for f, m in zip(frames, masks)]


def _apply_watermark(input_path, output_path, cfg):
    wm = cfg.watermark
    if not wm.enabled:
        from src.video.ffmpeg_utils import remux_video
        remux_video(input_path, output_path)
        return
    if wm.type == "text":
        text_wm.apply(input_path, output_path, wm)
    elif wm.type == "image":
        image_wm.apply(input_path, output_path, wm)
    else:
        raise ValueError(f"Unknown watermark type: {wm.type}")
