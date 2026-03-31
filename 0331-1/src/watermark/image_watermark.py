"""Stage F: Image watermark overlay via ffmpeg"""
from __future__ import annotations

from src.video.ffmpeg_utils import add_watermark_image, remux_video
from src.config import WatermarkConfig


def apply(
    input_path: str,
    output_path: str,
    cfg: WatermarkConfig,
) -> None:
    if not cfg.enabled:
        # ffmpeg passthrough: re-encode with libx264 + preserve audio; no overlay
        remux_video(input_path, output_path)
        return
    if not cfg.image_path:
        raise ValueError("WatermarkConfig.image_path must be set for type='image'")
    add_watermark_image(
        input_path=input_path,
        output_path=output_path,
        image_path=cfg.image_path,
        position=cfg.position,
        opacity=cfg.opacity,
        margin=cfg.margin,
        start_sec=cfg.start_sec,
        end_sec=cfg.end_sec,
    )
