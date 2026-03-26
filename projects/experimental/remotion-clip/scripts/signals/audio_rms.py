"""Audio RMS peak detection signal."""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class AudioRMS(SignalModule):
    SIGNAL_ID = "audio_rms"
    VERSION = "1.0.0"
    TIER = 1

    def analyze(self, video_path: str, window_sec: float = 5.0, **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)

        # Extract RMS levels via astats
        result = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-af", f"astats=metadata=1:reset=30,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
             "-f", "null", "-"],
            capture_output=True, text=True,
        )

        # Parse frame timestamps and RMS values
        samples: list[tuple[float, float]] = []
        current_time = None
        for line in result.stdout.splitlines():
            m_time = re.search(r"pts_time:([\d.]+)", line)
            if m_time:
                current_time = float(m_time.group(1))
            m_rms = re.search(r"lavfi\.astats\.Overall\.RMS_level=([-\d.]+)", line)
            if m_rms and current_time is not None:
                try:
                    val = float(m_rms.group(1))
                    if val > -200:
                        samples.append((current_time, val))
                except ValueError:
                    pass

        # Aggregate into windows
        windows_def = self.make_windows(duration, window_sec)
        buckets: dict[int, list[float]] = defaultdict(list)
        for t, v in samples:
            idx = int(t // window_sec)
            if idx < len(windows_def):
                buckets[idx].append(v)

        # Convert dB to linear energy for better normalization
        raw_values = []
        for i in range(len(windows_def)):
            vals = buckets.get(i, [])
            if vals:
                avg_db = sum(vals) / len(vals)
                raw_values.append(avg_db)
            else:
                raw_values.append(-100.0)

        # Normalize: higher RMS = higher score
        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="audio_rms",
                meta={"avg_rms_db": round(raw_values[i], 2)},
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
    run_cli(AudioRMS())
