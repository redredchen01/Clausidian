"""Speech rate signal — words/characters per second from Whisper transcript."""

from __future__ import annotations

import json

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class SpeechRate(SignalModule):
    SIGNAL_ID = "speech_rate"
    VERSION = "1.0.0"
    TIER = 2

    def analyze(self, video_path: str, window_sec: float = 2.0,
                transcript_path: str = "signals_cache/transcript.json", **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)

        with open(transcript_path) as f:
            transcript = json.load(f)

        chunks = transcript.get("chunks", [])

        # Build per-second character density
        windows_def = self.make_windows(duration, window_sec)
        char_counts = [0] * len(windows_def)

        for chunk in chunks:
            ts = chunk.get("timestamp", [None, None])
            if not ts or ts[0] is None:
                continue
            start = ts[0]
            end = ts[1] if ts[1] is not None else start + 1.0
            text = chunk.get("text", "").strip()
            if not text:
                continue

            # Count characters (better than words for CJK languages)
            char_count = len(text.replace(" ", ""))
            chunk_dur = max(0.1, end - start)
            chars_per_sec = char_count / chunk_dur

            # Distribute across overlapping windows
            for i, (w_start, w_end) in enumerate(windows_def):
                overlap_start = max(start, w_start)
                overlap_end = min(end, w_end)
                if overlap_end > overlap_start:
                    overlap_ratio = (overlap_end - overlap_start) / chunk_dur
                    char_counts[i] += chars_per_sec * overlap_ratio * window_sec

        raw_values = [float(c) for c in char_counts]
        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="speech_rate",
                meta={"chars_in_window": round(raw_values[i], 1)},
            ))

        return SignalOutput(
            signal_id=self.SIGNAL_ID,
            source=video_path,
            version=self.VERSION,
            duration_sec=duration,
            params={"window_sec": window_sec, "transcript_path": transcript_path},
            windows=windows,
        )


if __name__ == "__main__":
    run_cli(SpeechRate())
