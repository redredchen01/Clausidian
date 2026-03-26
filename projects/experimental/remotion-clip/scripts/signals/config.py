"""Default weights, presets, and signal registry."""

PRESETS = {
    "balanced": {
        "audio_rms": 1.0,
        "scene_change": 1.0,
        "silence_detect": 0.5,
        "loudness_ebur128": 0.8,
    },
    "music_video": {
        "audio_rms": 2.0,
        "scene_change": 1.5,
        "motion_estimate": 1.0,
        "loudness_ebur128": 1.5,
    },
    "interview": {
        "speech_rate": 1.5,
        "keyword_detect": 2.0,
        "speaker_change": 1.0,
        "llm_score": 2.0,
    },
    "lecture": {
        "keyword_detect": 2.0,
        "speech_rate": 1.0,
        "embedding_novelty": 1.5,
        "llm_score": 1.5,
    },
    "vlog": {
        "audio_rms": 1.0,
        "scene_change": 1.0,
        "speech_rate": 1.0,
        "llm_score": 1.5,
        "motion_estimate": 0.8,
    },
}

TIER_SIGNALS = {
    "tier1": ["audio_rms", "scene_change", "silence_detect", "motion_estimate", "loudness_ebur128"],
    "tier2": ["speech_rate", "keyword_detect", "speaker_change"],
    "tier3": ["llm_score", "sentiment_peaks", "embedding_novelty"],
}

SIGNAL_MODULES = {
    "audio_rms": "scripts.signals.audio_rms",
    "scene_change": "scripts.signals.scene_change",
    "silence_detect": "scripts.signals.silence_detect",
    "motion_estimate": "scripts.signals.motion_estimate",
    "loudness_ebur128": "scripts.signals.loudness_ebur128",
}


def resolve_signals(spec: str) -> list[str]:
    """Resolve 'tier1', 'all', or comma-separated signal names."""
    if spec == "all":
        out = []
        for tier in ["tier1", "tier2", "tier3"]:
            out.extend(TIER_SIGNALS[tier])
        return out
    if spec in TIER_SIGNALS:
        return TIER_SIGNALS[spec]
    return [s.strip() for s in spec.split(",") if s.strip()]


def get_weights(preset: str | None = None, overrides: dict | None = None) -> dict:
    weights = dict(PRESETS.get(preset or "balanced", PRESETS["balanced"]))
    if overrides:
        weights.update(overrides)
    return weights
