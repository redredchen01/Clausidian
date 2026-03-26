"""Silence detection signal — non-silent regions score higher."""

from __future__ import annotations

import re
import subprocess

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class SilenceDetect(SignalModule):
    SIGNAL_ID = "silence_detect"
    VERSION = "1.0.0"
    TIER = 1

    def analyze(self, video_path: str, window_sec: float = 5.0,
                noise_db: float = -30.0, min_duration: float = 0.5, **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)

        result = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
             "-f", "null", "-"],
            capture_output=True, text=True,
        )

        # Parse silence intervals from stderr
        silence_ranges: list[tuple[float, float]] = []
        current_start = None
        for line in result.stderr.splitlines():
            m_start = re.search(r"silence_start:\s*([\d.]+)", line)
            if m_start:
                current_start = float(m_start.group(1))
            m_end = re.search(r"silence_end:\s*([\d.]+)", line)
            if m_end and current_start is not None:
                silence_ranges.append((current_start, float(m_end.group(1))))
                current_start = None

        # Calculate silence ratio per window (inverted: less silence = higher score)
        windows_def = self.make_windows(duration, window_sec)
        raw_values = []
        for w_start, w_end in windows_def:
            w_dur = w_end - w_start
            silent_sec = 0.0
            for s_start, s_end in silence_ranges:
                overlap_start = max(w_start, s_start)
                overlap_end = min(w_end, s_end)
                if overlap_end > overlap_start:
                    silent_sec += overlap_end - overlap_start
            # Invert: 1.0 = no silence, 0.0 = all silent
            active_ratio = 1.0 - (silent_sec / w_dur) if w_dur > 0 else 0.0
            raw_values.append(active_ratio)

        # Already 0-1, but normalize to spread the range
        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="silence_detect",
                meta={"active_ratio": round(raw_values[i], 3)},
            ))

        return SignalOutput(
            signal_id=self.SIGNAL_ID,
            source=video_path,
            version=self.VERSION,
            duration_sec=duration,
            params={"window_sec": window_sec, "noise_db": noise_db, "min_duration": min_duration},
            windows=windows,
        )


if __name__ == "__main__":
    run_cli(SilenceDetect())
