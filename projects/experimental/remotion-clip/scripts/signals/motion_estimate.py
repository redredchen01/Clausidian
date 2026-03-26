"""Motion intensity signal via ffmpeg mestimate."""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class MotionEstimate(SignalModule):
    SIGNAL_ID = "motion_estimate"
    VERSION = "1.0.0"
    TIER = 1

    def analyze(self, video_path: str, window_sec: float = 5.0, **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)
        fps = self.probe_fps(video_path)

        # Use signalstats to get motion-related metrics (HUEAVG changes as proxy)
        # mestimate + metadata is unreliable across ffmpeg versions,
        # so we use frame-to-frame PSNR as a motion proxy instead:
        # low PSNR between frames = high motion
        result = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-vf", f"fps={min(fps, 10)},tblend=all_mode=difference,metadata=print",
             "-f", "null", "-"],
            capture_output=True, text=True,
        )

        # Parse frame info — difference blend creates brighter pixels where motion occurs
        # We'll use showinfo to get mean luminance of the difference frames
        # Fallback: use scene score as motion proxy (already available)
        # Better approach: use signalstats filter
        result2 = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-vf", f"fps={min(fps, 5)},signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-",
             "-f", "null", "-"],
            capture_output=True, text=True,
            timeout=300,
        )

        # Parse YDIF (luma temporal difference) — higher = more motion
        samples: list[tuple[float, float]] = []
        current_time = None
        for line in result2.stdout.splitlines():
            m_t = re.search(r"pts_time:([\d.]+)", line)
            if m_t:
                current_time = float(m_t.group(1))
            m_v = re.search(r"lavfi\.signalstats\.YDIF=([\d.]+)", line)
            if m_v and current_time is not None:
                try:
                    samples.append((current_time, float(m_v.group(1))))
                except ValueError:
                    pass

        # Aggregate per window
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
                raw_values.append(sum(vals) / len(vals))
            else:
                raw_values.append(0.0)

        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="motion_estimate",
                meta={"avg_ydif": round(raw_values[i], 3)},
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
    run_cli(MotionEstimate())
