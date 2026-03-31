"""
Dynamic Watermark Removal Tool — CLI Entrypoint

Usage:
    python -m src.app --input video.mp4 --output out.mp4 --config configs/demo.yaml
    python -m src.app --input video.mp4 --output out.mp4 --config configs/demo.yaml --only-detect --save-debug
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from src.config import load_config
from src.pipeline.run_pipeline import PipelineMode, run_pipeline


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Dynamic text watermark removal and re-watermarking tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full pipeline (detect → remove → add watermark):
  python -m src.app --input input.mp4 --output output.mp4 --config configs/demo.yaml

  # Only detect and preview watermark locations:
  python -m src.app --input input.mp4 --output out.mp4 --config configs/demo.yaml --only-detect --save-debug

  # Remove watermark without adding new one:
  python -m src.app --input input.mp4 --output output.mp4 --config configs/demo.yaml --disable-add-watermark
""",
    )
    parser.add_argument("--input", required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--config", required=True, help="Config YAML path")
    parser.add_argument("--save-debug", action="store_true", default=False,
                        help="Save debug frames and logs to debug/")
    parser.add_argument("--disable-add-watermark", action="store_true", default=False,
                        help="Skip adding new watermark overlay")

    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--only-detect", action="store_true",
                            help="Only run detection, output debug video")
    mode_group.add_argument("--only-mask", action="store_true",
                            help="Only run detection + tracking + mask building")
    mode_group.add_argument("--only-remove", action="store_true",
                            help="Run full removal pipeline but skip watermark overlay")

    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    cfg = load_config(args.config)

    # CLI overrides
    if args.save_debug:
        cfg.debug.enabled = True
    if args.disable_add_watermark:
        cfg.watermark.enabled = False
    cfg.input.path = args.input

    # Determine mode
    if args.only_detect:
        mode = PipelineMode.ONLY_DETECT
    elif args.only_mask:
        mode = PipelineMode.ONLY_MASK
    elif args.only_remove:
        mode = PipelineMode.ONLY_REMOVE
    else:
        mode = PipelineMode.FULL

    try:
        run_pipeline(cfg, args.input, args.output, mode)
        return 0
    except Exception as e:
        print(f"❌ Pipeline failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
