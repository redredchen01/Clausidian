"""
EasyOCR PoC Validation Script

Gates Unit 1-10: verifies EasyOCR can detect text watermarks at ≥ 70% rate.

Usage:
    # Synthetic validation (no video files needed):
    python scripts/poc_easyocr.py --synthetic

    # Real video validation:
    python scripts/poc_easyocr.py --video path/to/video.mp4 [--frames 20]
"""
import argparse
import sys
import time
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np


def make_synthetic_frame(
    width: int = 640,
    height: int = 480,
    text: str = "Copyright 2026",
    position: Tuple[int, int] = (30, 440),
    font_scale: float = 1.0,
    alpha: float = 1.0,
) -> np.ndarray:
    """合成帶文字水印的 BGR 幀（灰色背景 + 白色半透明文字）"""
    frame = np.full((height, width, 3), 128, dtype=np.uint8)
    # 隨機背景紋理讓場景更真實
    noise = np.random.randint(0, 40, (height, width, 3), dtype=np.uint8)
    frame = cv2.add(frame, noise)

    overlay = frame.copy()
    cv2.putText(
        overlay, text, position,
        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 2, cv2.LINE_AA
    )
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    return frame


def run_easyocr_detect(frame: np.ndarray, reader, confidence_threshold: float = 0.3) -> List:
    """跑一幀偵測，返回 bbox 列表"""
    results = reader.readtext(frame, batch_size=4)
    return [r for r in results if r[2] >= confidence_threshold]


def validate_synthetic(confidence_threshold: float = 0.3) -> bool:
    """用 20 個合成幀驗證 detection rate"""
    try:
        import easyocr
    except ImportError:
        print("❌ easyocr 未安裝。請執行: pip install easyocr")
        return False

    print("▶ 載入 EasyOCR（首次載入會下載模型 ~200MB）...")
    t0 = time.time()
    reader = easyocr.Reader(["ch_sim", "en"], gpu=False, verbose=False)
    print(f"  Reader 初始化完成，耗時 {time.time() - t0:.1f}s")

    # 合成多樣幀：不同文字、位置、透明度
    test_cases = [
        ("Copyright 2026", (30, 440), 1.0, 1.0),
        ("版權所有", (20, 460), 1.2, 0.9),
        ("CHANNEL NAME", (100, 30), 0.9, 1.0),
        ("watermark text", (200, 250), 0.8, 0.8),
        ("@username", (30, 50), 1.1, 1.0),
    ]

    total = 0
    detected = 0

    for text, pos, scale, alpha in test_cases:
        for _ in range(4):  # 每種變體 4 幀
            frame = make_synthetic_frame(text=text, position=pos, font_scale=scale, alpha=alpha)
            t0 = time.time()
            results = run_easyocr_detect(frame, reader, confidence_threshold)
            elapsed = (time.time() - t0) * 1000
            total += 1
            if results:
                detected += 1
            print(f"  [{total:2d}/20] detections={len(results):2d}  {elapsed:.0f}ms")

    rate = detected / total
    print(f"\n{'='*50}")
    print(f"Detection rate: {detected}/{total} = {rate:.0%}")
    print(f"Confidence threshold: {confidence_threshold}")
    if rate >= 0.70:
        print("✅ GATE PASSED — proceed to Unit 1-10")
        return True
    else:
        print("⚠️  GATE NOT MET — consider fallback A/B/C in plan")
        print("  Fallback A: CLAHE pre-processing")
        print("  Fallback B: allow hint_bbox config field")
        print("  Fallback C: frame-difference detection")
        return False


def validate_video(video_path: str, n_frames: int = 20, confidence_threshold: float = 0.3) -> bool:
    """從真實影片抽幀驗證"""
    try:
        import easyocr
    except ImportError:
        print("❌ easyocr 未安裝")
        return False

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ 無法開啟影片：{video_path}")
        return False

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, total_frames // n_frames)
    print(f"▶ 影片：{video_path}  總幀數：{total_frames}  採樣間隔：{step}")

    reader = easyocr.Reader(["ch_sim", "en"], gpu=False, verbose=False)

    sampled, detected = 0, 0
    idx = 0
    while sampled < n_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            break
        results = run_easyocr_detect(frame, reader, confidence_threshold)
        sampled += 1
        if results:
            detected += 1
            texts = [r[1] for r in results]
            print(f"  [{sampled:2d}] frame={idx:5d}  ✓ {texts}")
        else:
            print(f"  [{sampled:2d}] frame={idx:5d}  (no detection)")
        idx += step

    cap.release()
    rate = detected / sampled if sampled > 0 else 0
    print(f"\nDetection rate: {detected}/{sampled} = {rate:.0%}")
    return rate >= 0.70


def main():
    parser = argparse.ArgumentParser(description="EasyOCR PoC Validation")
    parser.add_argument("--synthetic", action="store_true", help="使用合成幀驗證（不需真實影片）")
    parser.add_argument("--video", type=str, help="真實影片路徑")
    parser.add_argument("--frames", type=int, default=20, help="採樣幀數（default: 20）")
    parser.add_argument("--threshold", type=float, default=0.3, help="置信度閾值（default: 0.3）")
    args = parser.parse_args()

    if args.synthetic:
        ok = validate_synthetic(args.threshold)
    elif args.video:
        ok = validate_video(args.video, args.frames, args.threshold)
    else:
        print("請指定 --synthetic 或 --video <path>")
        parser.print_help()
        sys.exit(1)

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
