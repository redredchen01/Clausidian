#!/usr/bin/env python3
"""Local Whisper transcription using transformers + MPS acceleration."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

PYTHON_ENV = "/opt/homebrew/Caskroom/miniforge/base/envs/ghost-remover/bin/python3"
DEFAULT_MODEL = "openai/whisper-base"


def extract_audio(video_path: str, audio_path: str) -> str:
    """Extract audio from video as WAV (16kHz mono for Whisper)."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path,
         "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
         audio_path],
        capture_output=True,
    )
    return audio_path


def transcribe_with_whisper(audio_path: str, model_name: str = DEFAULT_MODEL,
                            language: str | None = None) -> dict:
    """Run Whisper transcription in the ghost-remover conda env (has torch+transformers)."""

    # Build the transcription script to run in the conda env
    script = f'''
import json, sys
from transformers import pipeline

pipe = pipeline(
    "automatic-speech-recognition",
    model="{model_name}",
    device="mps",
    torch_dtype="float32",
)

result = pipe(
    "{audio_path}",
    return_timestamps=True,
    chunk_length_s=30,
    batch_size=8,
    generate_kwargs={{"language": "{language}"}} if "{language}" != "None" else {{}},
)

json.dump(result, sys.stdout, ensure_ascii=False)
'''

    result = subprocess.run(
        [PYTHON_ENV, "-c", script],
        capture_output=True, text=True,
        timeout=1200,
    )

    if result.returncode != 0:
        print(f"Whisper stderr: {result.stderr[-500:]}", file=sys.stderr)
        raise RuntimeError(f"Whisper failed: {result.returncode}")

    # Parse JSON from stdout (skip any warnings on stderr)
    return json.loads(result.stdout)


def transcribe(video_path: str, output_path: str,
               model_name: str = DEFAULT_MODEL, language: str | None = None) -> dict:
    """Full pipeline: extract audio → transcribe → save."""
    cache_dir = Path(output_path).parent
    cache_dir.mkdir(parents=True, exist_ok=True)
    audio_path = str(cache_dir / "audio_temp.wav")

    print(f"[transcribe] Extracting audio from {video_path}...")
    extract_audio(video_path, audio_path)

    audio_size_mb = os.path.getsize(audio_path) / 1024 / 1024
    print(f"[transcribe] Audio: {audio_size_mb:.1f}MB, model: {model_name}")

    print(f"[transcribe] Running Whisper ({model_name}) on MPS...")
    result = transcribe_with_whisper(audio_path, model_name, language)

    # Save transcript
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    # Cleanup temp audio
    try:
        os.unlink(audio_path)
    except OSError:
        pass

    chunks = result.get("chunks", [])
    print(f"[transcribe] {len(chunks)} chunks → {output_path}")
    return result


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Local Whisper transcription")
    parser.add_argument("--input", required=True, help="Video file path")
    parser.add_argument("--output", default="signals_cache/transcript.json")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--language", default=None, help="Language hint (e.g. ja, zh, en)")
    args = parser.parse_args()
    transcribe(args.input, args.output, args.model, args.language)
