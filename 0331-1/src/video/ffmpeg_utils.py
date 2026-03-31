"""FFmpeg subprocess utilities"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional


def _require_ffmpeg() -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError(
            "ffmpeg not found in PATH. Install it: https://ffmpeg.org/download.html"
        )
    return ffmpeg


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed (exit {result.returncode}):\n{result.stderr}"
        )


def add_watermark_text(
    input_path: str,
    output_path: str,
    text: str,
    position: str = "bottom-right",
    opacity: float = 0.7,
    scale: float = 1.0,
    margin: int = 20,
    start_sec: Optional[float] = None,
    end_sec: Optional[float] = None,
) -> None:
    ffmpeg = _require_ffmpeg()
    x_expr, y_expr = _position_to_expr(position, margin)
    fontsize = max(12, int(24 * scale))
    enable = _enable_expr(start_sec, end_sec)
    drawtext = (
        f"drawtext=text='{text}':x={x_expr}:y={y_expr}:"
        f"fontsize={fontsize}:fontcolor=white@{opacity:.2f}:"
        f"enable='{enable}'"
    )
    cmd = [
        ffmpeg, "-y", "-i", input_path,
        "-vf", drawtext,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]
    _run(cmd)


def add_watermark_image(
    input_path: str,
    output_path: str,
    image_path: str,
    position: str = "bottom-right",
    opacity: float = 0.7,
    margin: int = 20,
    start_sec: Optional[float] = None,
    end_sec: Optional[float] = None,
) -> None:
    if not Path(image_path).exists():
        raise RuntimeError(f"Watermark image not found: {image_path}")
    ffmpeg = _require_ffmpeg()
    x_expr, y_expr = _position_to_expr(position, margin)
    enable = _enable_expr(start_sec, end_sec)
    overlay = f"overlay={x_expr}:{y_expr}:enable='{enable}'"
    cmd = [
        ffmpeg, "-y",
        "-i", input_path,
        "-i", image_path,
        "-filter_complex",
        f"[1:v]format=rgba,colorchannelmixer=aa={opacity:.2f}[wm];[0:v][wm]{overlay}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]
    _run(cmd)


def remux_video(input_path: str, output_path: str) -> None:
    """重新封裝影片（libx264 + 保留音訊），不添加任何 overlay"""
    ffmpeg = _require_ffmpeg()
    cmd = [
        ffmpeg, "-y", "-i", input_path,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]
    _run(cmd)


def apply_delogo(
    input_path: str,
    output_path: str,
    x: int,
    y: int,
    w: int,
    h: int,
    band: int = 4,
) -> None:
    ffmpeg = _require_ffmpeg()
    cmd = [
        ffmpeg, "-y", "-i", input_path,
        "-vf", f"delogo=x={x}:y={y}:w={w}:h={h}:band={band}:show=0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "copy",
        output_path,
    ]
    _run(cmd)


def _position_to_expr(position: str, margin: int) -> tuple[str, str]:
    m = margin
    positions = {
        "top-left":     (str(m), str(m)),
        "top-right":    (f"W-w-{m}", str(m)),
        "bottom-left":  (str(m), f"H-h-{m}"),
        "bottom-right": (f"W-w-{m}", f"H-h-{m}"),
        "center":       ("(W-w)/2", "(H-h)/2"),
    }
    return positions.get(position, (str(m), f"H-h-{m}"))


def _enable_expr(start_sec: Optional[float], end_sec: Optional[float]) -> str:
    if start_sec is not None and end_sec is not None:
        return f"between(t,{start_sec},{end_sec})"
    elif start_sec is not None:
        return f"gte(t,{start_sec})"
    elif end_sec is not None:
        return f"lte(t,{end_sec})"
    return "1"
