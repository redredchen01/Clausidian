#!/usr/bin/env python3
"""Pre-cut segments from source video using ffmpeg -c copy."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def precut(segments_json: str, source_video: str, output_dir: str = "public/clips"):
    with open(segments_json) as f:
        data = json.load(f)

    segments = data.get("segments", [])
    if not segments:
        print("No segments found")
        return

    os.makedirs(output_dir, exist_ok=True)

    # Remove old clips
    for old in Path(output_dir).glob("seg*.mp4"):
        old.unlink()

    for i, seg in enumerate(segments):
        start = seg["startSec"]
        end = seg["endSec"]
        duration = end - start
        out_file = os.path.join(output_dir, f"seg{i+1:02d}.mp4")

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),
            "-t", str(duration),
            "-i", source_video,
            "-c", "copy",
            out_file,
        ]
        subprocess.run(cmd, capture_output=True)
        size_mb = os.path.getsize(out_file) / 1024 / 1024
        print(f"  seg{i+1:02d}.mp4  {start:.1f}-{end:.1f}s ({duration:.1f}s)  {size_mb:.1f}MB")

    print(f"\n[precut] {len(segments)} clips → {output_dir}/")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Pre-cut video segments")
    parser.add_argument("--segments", default="input/segments.json")
    parser.add_argument("--source", required=True, help="Source video path")
    parser.add_argument("--output-dir", default="public/clips")
    args = parser.parse_args()
    precut(args.segments, args.source, args.output_dir)
