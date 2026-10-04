"""Generate synthetic sample test assets for InspectVision AI.

Creates:
  sample_data/defect_sample_1.jpg  (scratched metal plate)
  sample_data/defect_sample_2.jpg  (cracked part)
  sample_data/conveyor_demo.mp4     (10s moving-belt clip, 960x540 @ 30fps)

Run:  python tools/generate_samples.py
Requires: opencv-python-headless, numpy
"""
from pathlib import Path
import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "sample_data"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 960, 540


def metal_base(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = np.full((H, W, 3), (52, 56, 64), np.uint8)
    noise = rng.integers(0, 22, (H, W, 1), dtype=np.uint8)
    img = cv2.add(img, np.repeat(noise, 3, axis=2))
    cv2.rectangle(img, (W // 2 - 220, H // 2 - 140), (W // 2 + 220, H // 2 + 140), (96, 102, 114), -1)
    cv2.rectangle(img, (W // 2 - 220, H // 2 - 140), (W // 2 + 220, H // 2 + 140), (160, 168, 180), 3)
    for i in range(6):
        y = H // 2 - 100 + i * 40
        cv2.line(img, (W // 2 - 200, y), (W // 2 + 200, y), (80, 86, 96), 1)
    return img


def sample_1() -> None:
    img = metal_base(1)
    # scratches (thin bright lines)
    cv2.line(img, (300, 200), (620, 260), (220, 225, 235), 2)
    cv2.line(img, (320, 300), (600, 330), (210, 215, 225), 1)
    # dent (dark ellipse + highlight)
    cv2.ellipse(img, (620, 350), (46, 30), 20, 0, 360, (28, 30, 36), -1)
    cv2.ellipse(img, (614, 344), (40, 24), 20, 0, 360, (120, 126, 136), 2)
    # discoloration blotch
    cv2.ellipse(img, (380, 360), (70, 34), -15, 0, 360, (60, 72, 90), -1)
    cv2.putText(img, "SAMPLE 1: scratch+dent+discoloration", (24, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (34, 211, 238), 2)
    cv2.imwrite(str(OUT / "defect_sample_1.jpg"), img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])


def sample_2() -> None:
    img = metal_base(2)
    # crack (jagged dark polyline)
    pts = np.array([[430, 160], [470, 220], [450, 280], [500, 340], [480, 400]], np.int32)
    cv2.polylines(img, [pts], False, (12, 12, 16), 3)
    cv2.polylines(img, [pts + 3], False, (200, 60, 60), 1)
    # missing-part hole
    cv2.circle(img, (640, 260), 34, (10, 10, 12), -1)
    cv2.circle(img, (640, 260), 34, (239, 68, 68), 2)
    cv2.putText(img, "SAMPLE 2: crack + missing part", (24, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (34, 211, 238), 2)
    cv2.imwrite(str(OUT / "defect_sample_2.jpg"), img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])


def demo_video(seconds: int = 10, fps: int = 30) -> None:
    path = str(OUT / "conveyor_demo.mp4")
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
    for f in range(seconds * fps):
        img = metal_base(3).astype(np.int16)
        shift = int((f * 6) % 120)
        for x in range(-120 + shift, W + 120, 120):  # belt slats drift
            cv2.line(img, (x, 0), (x - 60, H), (70, 72, 80), 4)
        # travelling scratch
        sx = int((f * 4) % (W - 200)) + 100
        cv2.line(img, (sx, H // 2 - 40), (sx + 160, H // 2 + 20), (225, 230, 240), 2)
        frame = np.clip(img, 0, 255).astype(np.uint8)
        cv2.putText(frame, f"CONVEYOR DEMO  f{f}", (24, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (34, 211, 238), 2)
        vw.write(frame)
    vw.release()


if __name__ == "__main__":
    sample_1()
    sample_2()
    demo_video()
    print(f"wrote {[p.name for p in OUT.iterdir()]} to {OUT}")
