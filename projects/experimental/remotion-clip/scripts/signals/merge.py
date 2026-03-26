"""Multi-signal merger: weighted composite → ranked candidate segments → segments.json."""

from __future__ import annotations

import json
import math
from pathlib import Path

from .base import SignalOutput


def gaussian_kernel(size: int, sigma: float) -> list[float]:
    kernel = []
    for i in range(-size, size + 1):
        kernel.append(math.exp(-0.5 * (i / sigma) ** 2))
    total = sum(kernel)
    return [k / total for k in kernel]


def smooth(values: list[float], sigma: float = 2.0) -> list[float]:
    if sigma <= 0 or len(values) < 3:
        return values
    size = int(sigma * 3)
    kernel = gaussian_kernel(size, sigma)
    n = len(values)
    result = []
    for i in range(n):
        total = 0.0
        weight_sum = 0.0
        for j, k in enumerate(kernel):
            idx = i + j - size
            if 0 <= idx < n:
                total += values[idx] * k
                weight_sum += k
        result.append(total / weight_sum if weight_sum > 0 else 0.0)
    return result


def resample_to_grid(signal: SignalOutput, grid_sec: float = 1.0) -> list[float]:
    """Resample signal windows to a 1-second grid."""
    n = int(math.ceil(signal.duration_sec / grid_sec))
    grid = [0.0] * n
    for w in signal.windows:
        start_idx = int(w.start_sec / grid_sec)
        end_idx = min(int(math.ceil(w.end_sec / grid_sec)), n)
        for i in range(start_idx, end_idx):
            grid[i] = max(grid[i], w.score)
    return grid


def find_peaks(values: list[float], min_height: float = 0.3) -> list[int]:
    """Find local maxima above min_height."""
    peaks = []
    n = len(values)
    for i in range(1, n - 1):
        if values[i] >= min_height:
            if values[i] >= values[i - 1] and values[i] >= values[i + 1]:
                peaks.append(i)
    return peaks


def expand_peak(values: list[float], peak: int,
                min_seg: int, max_seg: int, threshold: float = 0.3) -> tuple[int, int]:
    """Expand a peak into a segment [start, end)."""
    n = len(values)
    left = peak
    right = peak + 1

    # Expand left
    while left > 0 and values[left - 1] >= threshold and (right - left) < max_seg:
        left -= 1
    # Expand right
    while right < n and values[right] >= threshold and (right - left) < max_seg:
        right += 1

    # Enforce minimum length
    while (right - left) < min_seg and (left > 0 or right < n):
        if left > 0:
            left -= 1
        if (right - left) < min_seg and right < n:
            right += 1

    return left, min(right, n)


def snap_to_scene(start_sec: float, end_sec: float,
                  scene_timestamps: list[float], max_snap: float = 2.0) -> tuple[float, float]:
    """Snap segment boundaries to nearest scene change within max_snap seconds."""
    snapped_start = start_sec
    snapped_end = end_sec

    for t in scene_timestamps:
        if abs(t - start_sec) < abs(snapped_start - start_sec) and abs(t - start_sec) <= max_snap:
            snapped_start = t
        if abs(t - end_sec) < abs(snapped_end - end_sec) and abs(t - end_sec) <= max_snap:
            snapped_end = t

    if snapped_end <= snapped_start:
        return start_sec, end_sec
    return snapped_start, snapped_end


def coverage_bonus(segments: list[dict], duration_sec: float) -> float:
    """Score how well segments cover the timeline (0-1)."""
    if not segments or duration_sec <= 0:
        return 0.0
    quartile = duration_sec / 4
    covered = [False] * 4
    for seg in segments:
        mid = (seg["startSec"] + seg["endSec"]) / 2
        q = min(3, int(mid / quartile))
        covered[q] = True
    return sum(covered) / 4


def merge(
    signal_paths: list[str],
    weights: dict[str, float],
    target_duration: float = 60.0,
    min_segment_sec: float = 5.0,
    max_segment_sec: float = 15.0,
    grid_sec: float = 1.0,
    smooth_sigma: float = 2.0,
    peak_threshold: float = 0.3,
    scene_cache_path: str | None = None,
) -> list[dict]:
    """Merge multiple signal outputs into ranked candidate segments."""

    # Load signals
    signals: list[SignalOutput] = []
    for p in signal_paths:
        try:
            signals.append(SignalOutput.from_json(p))
        except Exception as e:
            print(f"Warning: skipping {p}: {e}")

    if not signals:
        return []

    duration = max(s.duration_sec for s in signals)
    n = int(math.ceil(duration / grid_sec))

    # 1. ALIGN — resample all to common grid
    grids: dict[str, list[float]] = {}
    for sig in signals:
        grids[sig.signal_id] = resample_to_grid(sig, grid_sec)
        # Pad to same length
        while len(grids[sig.signal_id]) < n:
            grids[sig.signal_id].append(0.0)

    # 2. COMPOSITE — weighted geometric-arithmetic hybrid
    # Arithmetic mean for same-tier signals, then geometric across tiers
    # This requires high scores on MULTIPLE signal types, not just one
    composite = [0.0] * n
    active_weights = {sid: weights.get(sid, 0.0) for sid in grids if weights.get(sid, 0.0) > 0}
    total_weight = sum(active_weights.values())
    if total_weight > 0:
        for i in range(n):
            # Weighted arithmetic mean
            arith = sum(grids[sid][i] * active_weights[sid] for sid in active_weights) / total_weight
            # Geometric boost: if multiple signals agree, boost the score
            non_zero = [grids[sid][i] for sid in active_weights if grids[sid][i] > 0.05]
            if len(non_zero) >= 2:
                geo_bonus = 1.0 + 0.2 * (len(non_zero) - 1)  # +20% per agreeing signal
            else:
                geo_bonus = 1.0
            composite[i] = min(1.0, arith * geo_bonus)

    # 3. SMOOTH
    composite = smooth(composite, sigma=smooth_sigma)

    # 4. PEAKS
    peaks = find_peaks(composite, min_height=peak_threshold)
    if not peaks:
        # Fallback: take top N positions
        indexed = sorted(range(n), key=lambda i: composite[i], reverse=True)
        peaks = indexed[:20]

    # 5. EXPAND peaks into segments
    min_seg = max(1, int(min_segment_sec / grid_sec))
    max_seg = int(max_segment_sec / grid_sec)
    candidates = []
    for peak in peaks:
        left, right = expand_peak(composite, peak, min_seg, max_seg, peak_threshold)
        avg_score = sum(composite[left:right]) / max(1, right - left)
        candidates.append({
            "start_idx": left,
            "end_idx": right,
            "score": avg_score,
            "peak_score": composite[peak],
        })

    # Remove duplicates (overlapping candidates: keep highest score)
    candidates.sort(key=lambda c: c["score"], reverse=True)
    unique = []
    used = set()
    for c in candidates:
        overlap = any(i in used for i in range(c["start_idx"], c["end_idx"]))
        if not overlap:
            unique.append(c)
            for i in range(c["start_idx"], c["end_idx"]):
                used.add(i)
    candidates = unique

    # 6. SNAP to scene changes
    scene_timestamps: list[float] = []
    if scene_cache_path:
        try:
            from .scene_change import SceneChange
            scene_timestamps = SceneChange.get_timestamps(scene_cache_path)
        except Exception:
            pass

    # 7. SELECT — greedy with coverage enforcement
    # Divide timeline into quartiles; ensure at least 1 segment per quartile if possible
    quartile_sec = duration / 4
    quartile_has = [False] * 4
    quartile_len = duration / 4

    def _get_quartile(idx: int) -> int:
        return min(3, int((idx * grid_sec) / quartile_len))

    def _make_segment(c: dict, remaining_budget: float) -> dict | None:
        start_sec = c["start_idx"] * grid_sec
        end_sec = c["end_idx"] * grid_sec
        seg_dur = end_sec - start_sec

        if seg_dur > remaining_budget:
            if remaining_budget >= min_segment_sec:
                end_sec = start_sec + remaining_budget
                seg_dur = remaining_budget
            else:
                return None

        if scene_timestamps:
            start_sec, end_sec = snap_to_scene(start_sec, end_sec, scene_timestamps)
            seg_dur = end_sec - start_sec

        # Determine dominant signal
        dominant = ""
        best_contribution = 0.0
        for sig_id, grid in grids.items():
            avg = sum(grid[c["start_idx"]:c["end_idx"]]) / max(1, c["end_idx"] - c["start_idx"])
            contribution = avg * weights.get(sig_id, 1.0)
            if contribution > best_contribution:
                best_contribution = contribution
                dominant = sig_id

        label_map = {
            "audio_rms": "Audio Peak",
            "scene_change": "Scene Shift",
            "silence_detect": "Active",
            "motion_estimate": "Motion",
            "loudness_ebur128": "Loud Moment",
            "speech_rate": "Fast Speech",
            "keyword_detect": "Keyword Hit",
            "llm_score": "AI Pick",
        }

        return {
            "startSec": round(start_sec, 1),
            "endSec": round(end_sec, 1),
            "label": label_map.get(dominant, dominant),
            "reason": f"composite={c['score']:.2f} dominant={dominant}",
            "_dur": seg_dur,
            "_quartile": _get_quartile(c["start_idx"]),
        }

    candidates.sort(key=lambda c: c["score"], reverse=True)

    # Pass 1: pick best candidate per quartile (coverage guarantee)
    selected = []
    total_sec = 0.0
    used_candidates = set()
    budget_per_quartile = target_duration / 4  # max ~25% per quartile
    quartile_sec = [0.0] * 4

    for q in range(4):
        best = None
        best_idx = -1
        for ci, c in enumerate(candidates):
            if ci in used_candidates:
                continue
            cq = _get_quartile(c["start_idx"])
            if cq == q:
                if best is None or c["score"] > best["score"]:
                    best = c
                    best_idx = ci
        if best is not None:
            seg = _make_segment(best, target_duration - total_sec)
            if seg:
                selected.append(seg)
                total_sec += seg["_dur"]
                quartile_sec[q] += seg["_dur"]
                quartile_has[q] = True
                used_candidates.add(best_idx)

    # Pass 2: fill remaining budget, but respect per-quartile cap
    candidates.sort(key=lambda c: c["score"], reverse=True)
    for ci, c in enumerate(candidates):
        if total_sec >= target_duration:
            break
        if ci in used_candidates:
            continue
        cq = _get_quartile(c["start_idx"])
        if quartile_sec[cq] >= budget_per_quartile:
            continue  # This quartile is full
        seg = _make_segment(c, target_duration - total_sec)
        if seg:
            selected.append(seg)
            total_sec += seg["_dur"]
            quartile_sec[cq] += seg["_dur"]
            used_candidates.add(ci)

    # Pass 3: if still under budget, relax quartile cap
    if total_sec < target_duration * 0.9:
        for ci, c in enumerate(candidates):
            if total_sec >= target_duration:
                break
            if ci in used_candidates:
                continue
            seg = _make_segment(c, target_duration - total_sec)
            if seg:
                selected.append(seg)
                total_sec += seg["_dur"]
                used_candidates.add(ci)

    # Clean up internal keys and sort by time
    for seg in selected:
        seg.pop("_dur", None)
        seg.pop("_quartile", None)
    selected.sort(key=lambda s: s["startSec"])

    return selected


def merge_to_segments_json(
    signal_paths: list[str],
    weights: dict[str, float],
    output_path: str,
    source: str = "source.mp4",
    target_duration: float = 60.0,
    **kwargs,
):
    """Run merge and write segments.json."""
    segments = merge(signal_paths, weights, target_duration=target_duration, **kwargs)

    # Calculate actual duration
    actual = sum(s["endSec"] - s["startSec"] for s in segments)

    data = {
        "source": source,
        "outputDurationSec": round(actual + 2, 1),  # +2 for intro card
        "segments": segments,
    }

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"[merge] {len(segments)} segments, {actual:.1f}s total → {output_path}")
    return data
