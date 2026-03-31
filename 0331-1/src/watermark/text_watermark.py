"""Stage F: Text watermark overlay via ffmpeg"""
from __future__ import annotations

from src.video.ffmpeg_utils import add_watermark_text, remux_video
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
    add_watermark_text(
        input_path=input_path,
        output_path=output_path,
        text=cfg.text,
        position=cfg.position,
        opacity=cfg.opacity,
        scale=cfg.scale,
        margin=cfg.margin,
        start_sec=cfg.start_sec,
        end_sec=cfg.end_sec,
    )
