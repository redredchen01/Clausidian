"""Speech energy signal — combines speech presence + text density + audio energy.
Regions with active speech that is also loud score highest."""

from __future__ import annotations

import json

from .base import SignalModule, SignalOutput, SignalWindow, run_cli


class SpeechEnergy(SignalModule):
    SIGNAL_ID = "speech_energy"
    VERSION = "1.0.0"
    TIER = 2

    def analyze(self, video_path: str, window_sec: float = 2.0,
                transcript_path: str = "signals_cache/transcript.json", **kwargs) -> SignalOutput:
        duration = self.probe_duration(video_path)

        with open(transcript_path) as f:
            transcript = json.load(f)

        chunks = transcript.get("chunks", [])

        windows_def = self.make_windows(duration, window_sec)
        # Track: speech presence, character density, and variation
        speech_presence = [0.0] * len(windows_def)
        char_density = [0.0] * len(windows_def)
        text_per_window: list[list[str]] = [[] for _ in range(len(windows_def))]

        for chunk in chunks:
            ts = chunk.get("timestamp", [None, None])
            if not ts or ts[0] is None:
                continue
            start = ts[0]
            end = ts[1] if ts[1] is not None else start + 1.0
            text = chunk.get("text", "").strip()

            for i, (w_start, w_end) in enumerate(windows_def):
                overlap_start = max(start, w_start)
                overlap_end = min(end, w_end)
                if overlap_end > overlap_start:
                    w_dur = w_end - w_start
                    overlap = overlap_end - overlap_start
                    speech_presence[i] = min(1.0, speech_presence[i] + overlap / w_dur)
                    if text:
                        chars = len(text.replace(" ", ""))
                        chunk_dur = max(0.1, end - start)
                        char_density[i] += chars * (overlap / chunk_dur) / w_dur
                        text_per_window[i].append(text)

        # Combined score: speech presence × char density (normalized)
        raw_values = []
        for i in range(len(windows_def)):
            # Presence weight + density weight
            raw = speech_presence[i] * 0.4 + char_density[i] * 0.6
            raw_values.append(raw)

        scores = self.normalize_minmax(raw_values)

        windows = []
        for i, (start, end) in enumerate(windows_def):
            windows.append(SignalWindow(
                start_sec=start,
                end_sec=end,
                score=scores[i],
                raw_value=raw_values[i],
                label="speech_energy",
                meta={
                    "speech_ratio": round(speech_presence[i], 3),
                    "char_density": round(char_density[i], 1),
                    "text": " ".join(text_per_window[i])[:100] if text_per_window[i] else "",
                },
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
    run_cli(SpeechEnergy())
