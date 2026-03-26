"""Base classes and data structures for signal modules."""

from __future__ import annotations

import json
import subprocess
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class SignalWindow:
    start_sec: float
    end_sec: float
    score: float  # 0.0 - 1.0 normalized
    raw_value: float = 0.0
    label: str = ""
    meta: dict = field(default_factory=dict)


@dataclass
class SignalOutput:
    signal_id: str
    source: str
    version: str
    duration_sec: float
    params: dict
    windows: list[SignalWindow]

    def to_json(self, path: str):
        data = asdict(self)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    @classmethod
    def from_json(cls, path: str) -> SignalOutput:
        with open(path) as f:
            data = json.load(f)
        data["windows"] = [SignalWindow(**w) for w in data["windows"]]
        return cls(**data)


class SignalModule(ABC):
    SIGNAL_ID: str = ""
    VERSION: str = "1.0.0"
    TIER: int = 1

    @abstractmethod
    def analyze(self, video_path: str, window_sec: float = 5.0, **kwargs) -> SignalOutput:
        ...

    @staticmethod
    def probe_duration(video_path: str) -> float:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", video_path],
            capture_output=True, text=True,
        )
        return float(result.stdout.strip())

    @staticmethod
    def probe_fps(video_path: str) -> float:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", video_path],
            capture_output=True, text=True,
        )
        num, den = result.stdout.strip().split("/")
        return float(num) / float(den)

    @staticmethod
    def normalize_minmax(values: list[float]) -> list[float]:
        if not values:
            return []
        lo, hi = min(values), max(values)
        if hi == lo:
            return [0.5] * len(values)
        return [(v - lo) / (hi - lo) for v in values]

    @staticmethod
    def normalize_percentile(values: list[float]) -> list[float]:
        if not values:
            return []
        n = len(values)
        sorted_vals = sorted(range(n), key=lambda i: values[i])
        ranks = [0.0] * n
        for rank, idx in enumerate(sorted_vals):
            ranks[idx] = rank / max(1, n - 1)
        return ranks

    @staticmethod
    def make_windows(duration_sec: float, window_sec: float) -> list[tuple[float, float]]:
        windows = []
        t = 0.0
        while t < duration_sec:
            end = min(t + window_sec, duration_sec)
            if end - t > 0.1:
                windows.append((t, end))
            t += window_sec
        return windows


def run_cli(module: SignalModule):
    """Standard CLI wrapper for any signal module."""
    import argparse
    parser = argparse.ArgumentParser(description=f"Signal: {module.SIGNAL_ID}")
    parser.add_argument("--input", required=True, help="Video file path")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--window-sec", type=float, default=5.0)
    args, extra = parser.parse_known_args()

    result = module.analyze(args.input, window_sec=args.window_sec)
    out_path = args.output or f"signals_cache/{module.SIGNAL_ID}.json"
    result.to_json(out_path)
    print(f"[{module.SIGNAL_ID}] {len(result.windows)} windows → {out_path}")
