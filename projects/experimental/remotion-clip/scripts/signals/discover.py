#!/usr/bin/env python3
"""CLI entrypoint: run selected signals + merge → segments.json."""

from __future__ import annotations

import argparse
import json
import sys
import os
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.signals.config import resolve_signals, get_weights, SIGNAL_MODULES
from scripts.signals.merge import merge_to_segments_json


def run_signal(signal_id: str, video_path: str, cache_dir: str, window_sec: float) -> str | None:
    """Run a single signal module, return cache path or None on failure."""
    out_path = os.path.join(cache_dir, f"{signal_id}.json")

    registry = {
        "audio_rms": ("scripts.signals.audio_rms", "AudioRMS"),
        "scene_change": ("scripts.signals.scene_change", "SceneChange"),
        "silence_detect": ("scripts.signals.silence_detect", "SilenceDetect"),
        "motion_estimate": ("scripts.signals.motion_estimate", "MotionEstimate"),
        "loudness_ebur128": ("scripts.signals.loudness_ebur128", "LoudnessEBUR128"),
        "speech_rate": ("scripts.signals.speech_rate", "SpeechRate"),
        "speech_energy": ("scripts.signals.speech_energy", "SpeechEnergy"),
    }

    if signal_id not in registry:
        print(f"[discover] Unknown signal: {signal_id}, skipping")
        return None

    mod_path, cls_name = registry[signal_id]
    import importlib
    mod = importlib.import_module(mod_path)
    module = getattr(mod, cls_name)()

    try:
        result = module.analyze(video_path, window_sec=window_sec)
        result.to_json(out_path)
        print(f"[{signal_id}] {len(result.windows)} windows → {out_path}")
        return out_path
    except Exception as e:
        print(f"[{signal_id}] ERROR: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Highlight Discovery Pipeline")
    parser.add_argument("--input", required=True, help="Source video path")
    parser.add_argument("--output", default="input/segments.json", help="Output segments.json path")
    parser.add_argument("--signals", default="audio_rms,scene_change", help="Signals: tier1, all, or comma-separated")
    parser.add_argument("--preset", default="balanced", help="Weight preset name")
    parser.add_argument("--weights", default=None, help="JSON weights override")
    parser.add_argument("--target-duration", type=float, default=60.0)
    parser.add_argument("--window-sec", type=float, default=5.0)
    parser.add_argument("--cache-dir", default="signals_cache")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--parallel", type=int, default=1, help="Max parallel signal jobs")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source-name", default="source.mp4", help="Source name in segments.json")
    args = parser.parse_args()

    video_path = os.path.abspath(args.input)
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found")
        sys.exit(1)

    signal_list = resolve_signals(args.signals)
    weights_override = json.loads(args.weights) if args.weights else None
    weights = get_weights(args.preset, weights_override)

    cache_dir = os.path.abspath(args.cache_dir)
    os.makedirs(cache_dir, exist_ok=True)

    print(f"[discover] Video: {video_path}")
    print(f"[discover] Signals: {signal_list}")
    print(f"[discover] Weights: {weights}")
    print(f"[discover] Target: {args.target_duration}s")

    if args.dry_run:
        print("[discover] Dry run — exiting")
        return

    # Filter out already cached if requested
    to_run = []
    for sig in signal_list:
        cached = os.path.join(cache_dir, f"{sig}.json")
        if args.skip_existing and os.path.exists(cached):
            print(f"[{sig}] Using cached: {cached}")
        else:
            to_run.append(sig)

    # Run signals
    signal_paths = []
    for sig in signal_list:
        cached = os.path.join(cache_dir, f"{sig}.json")
        if os.path.exists(cached) and sig not in to_run:
            signal_paths.append(cached)

    if args.parallel > 1 and len(to_run) > 1:
        with ProcessPoolExecutor(max_workers=args.parallel) as executor:
            futures = {
                executor.submit(run_signal, sig, video_path, cache_dir, args.window_sec): sig
                for sig in to_run
            }
            for future in as_completed(futures):
                path = future.result()
                if path:
                    signal_paths.append(path)
    else:
        for sig in to_run:
            path = run_signal(sig, video_path, cache_dir, args.window_sec)
            if path:
                signal_paths.append(path)

    if not signal_paths:
        print("[discover] No signals produced, exiting")
        sys.exit(1)

    # Check for scene_change cache for snap feature
    scene_cache = os.path.join(cache_dir, "scene_change.json")
    scene_cache_path = scene_cache if os.path.exists(scene_cache) else None

    # Merge
    merge_to_segments_json(
        signal_paths=signal_paths,
        weights=weights,
        output_path=args.output,
        source=args.source_name,
        target_duration=args.target_duration,
        scene_cache_path=scene_cache_path,
    )

    print(f"[discover] Done → {args.output}")


if __name__ == "__main__":
    main()
