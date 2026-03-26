"""Scene change density signal."""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class SceneChange(SignalModule):
    SIGNAL_ID = "scene_change"
    VERSION = "1.0.0"
    TIER = 1

    def analyze(self, video_path: str, window_sec: float = 5.0, threshold: float = 0.3, **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)

        result = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-filter:v", f"select='gt(scene,{threshold})',showinfo",
             "-f", "null", "-"],
            capture_output=True, text=True,
        )

        # Parse scene change timestamps + scores from stderr
        changes: list[tuple[float, float]] = []  # (timestamp, scene_score)
        for line in result.stderr.splitlines():
            if "showinfo" not in line or "pts_time:" not in line:
                continue
            m_t = re.search(r"pts_time:\s*([\d.]+)", line)
            if m_t:
                t = float(m_t.group(1))
                # Scene score is in the select filter, default to threshold
                changes.append((t, threshold))

        # Also do a finer pass to get actual scene scores for every frame
        result2 = subprocess.run(
            ["ffmpeg", "-i", video_path,
             "-vf", f"select='gte(scene,0)',metadata=print:key=lavfi.scene_score:file=-",
             "-an", "-f", "null", "-"],
            capture_output=True, text=True,
            timeout=300,
        )

        # Parse per-frame scene scores
        frame_scores: list[tuple[float, float]] = []
        current_time = None
        for line in result2.stdout.splitlines():
            m_t = re.search(r"pts_time:([\d.]+)", line)
            if m_t:
                current_time = float(m_t.group(1))
            m_s = re.search(r"lavfi\.scene_score=([\d.]+)", line)
            if m_s and current_time is not None:
                try:
                    frame_scores.append((current_time, float(m_s.group(1))))
                except ValueError:
                    pass

        # Aggregate: max scene score per window (not just count)
        windows_def = self.make_windows(duration, window_sec)
        raw_values = [0.0] * len(windows_def)
        counts = [0] * len(windows_def)

        if frame_scores:
            for t, score in frame_scores:
                idx = int(t // window_sec)
                if 0 <= idx < len(raw_values):
                    raw_values[idx] = max(raw_values[idx], score)
        else:
            # Fallback to binary counting
            for t, _ in changes:
                idx = int(t // window_sec)
                if 0 <= idx < len(counts):
                    counts[idx] += 1
            raw_values = [float(c) for c in counts]

        # Count for metadata
        for t, _ in changes:
            idx = int(t // window_sec)
            if 0 <= idx < len(counts):
                counts[idx] += 1

        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="scene_change",
                meta={"change_count": counts[i], "max_scene_score": round(raw_values[i], 4)},
            ))

        return SignalOutput(
            signal_id=self.SIGNAL_ID,
            source=video_path,
            version=self.VERSION,
            duration_sec=duration,
            params={"window_sec": window_sec, "threshold": threshold},
            windows=windows,
        )

    # Also expose raw timestamps for merge snap feature
    @staticmethod
    def get_timestamps(cache_path: str) -> list[float]:
        """Load cached signal and return raw scene change timestamps."""
        output = SignalOutput.from_json(cache_path)
        ts = []
        for w in output.windows:
            count = w.meta.get("change_count", 0)
            if count > 0:
                # Approximate: spread changes evenly within window
                step = (w.end_sec - w.start_sec) / (count + 1)
                for j in range(count):
                    ts.append(w.start_sec + step * (j + 1))
        return ts


if __name__ == "__main__":
    run_cli(SceneChange())
