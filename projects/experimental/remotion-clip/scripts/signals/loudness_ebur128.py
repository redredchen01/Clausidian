"""EBU R128 perceptual loudness signal."""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class LoudnessEBUR128(SignalModule):
    SIGNAL_ID = "loudness_ebur128"
    VERSION = "1.0.0"
    TIER = 1

    def analyze(self, video_path: str, window_sec: float = 5.0, **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)

        # ebur128 outputs per-frame momentary (M) and short-term (S) loudness to stderr
        result = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-af", "ebur128=peak=true",
             "-f", "null", "-"],
            capture_output=True, text=True,
        )

        # Parse momentary loudness values with timestamps
        # Format: [Parsed_ebur128...] t: X.XXX    M: -XX.X S: -XX.X ...
        samples: list[tuple[float, float]] = []
        for line in result.stderr.splitlines():
            if "ebur128" not in line:
                continue
            m_t = re.search(r"\bt:\s*([\d.]+)", line)
            m_m = re.search(r"\bM:\s*([-\d.]+)", line)
            if m_t and m_m:
                try:
                    t = float(m_t.group(1))
                    loudness = float(m_m.group(1))
                    if loudness > -120:
                        samples.append((t, loudness))
                except ValueError:
                    pass

        # Aggregate: peak momentary loudness per window
        windows_def = self.make_windows(duration, window_sec)
        buckets: dict[int, list[float]] = defaultdict(list)
        for t, v in samples:
            idx = int(t // window_sec)
            if idx < len(windows_def):
                buckets[idx].append(v)

        raw_values = []
        for i in range(len(windows_def)):
            vals = buckets.get(i, [])
            if vals:
                raw_values.append(max(vals))  # Peak momentary loudness
            else:
                raw_values.append(-70.0)

        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="loudness_ebur128",
                meta={"peak_momentary_lufs": round(raw_values[i], 2)},
            ))

        return SignalOutput(
            signal_id=self.SIGNAL_ID,
            source=video_path,
            version=self.VERSION,
            duration_sec=duration,
            params={"window_sec": window_sec},
            windows=windows,
        )


if __name__ == "__main__":
    run_cli(LoudnessEBUR128())
