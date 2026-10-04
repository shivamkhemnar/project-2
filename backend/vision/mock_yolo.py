"""Fallback synthetic inference engine.

Used automatically when PyTorch / ultralytics weights are unavailable,
so the full WebSocket + UI pipeline works on any machine (CPU-only, no GPU,
no model download). Generates temporally-coherent moving defect boxes.
"""
import random
import time
from typing import List

CLASSES = ["Scratch", "Dent", "Crack", "Discoloration", "Missing Part"]

# severity mapping per class (domain heuristic)
_SEVERITY = {
    "Scratch": "Low",
    "Discoloration": "Low",
    "Dent": "Medium",
    "Missing Part": "Medium",
    "Crack": "Critical",
}


class MockYOLO:
    """Drop-in replacement with a .predict(frame, conf, nms) API."""

    def __init__(self, seed: int = 7):
        self.rng = random.Random(seed)
        self.t0 = time.time()
        self.tracks = [
            {"cls": "Scratch", "cx": 0.30, "cy": 0.40, "w": 0.22, "h": 0.10, "vx": 0.0011, "vy": 0.0006},
            {"cls": "Crack", "cx": 0.65, "cy": 0.55, "w": 0.12, "h": 0.28, "vx": -0.0009, "vy": 0.0008},
            {"cls": "Dent", "cx": 0.50, "cy": 0.30, "w": 0.14, "h": 0.14, "vx": 0.0007, "vy": -0.0005},
            {"cls": "Discoloration", "cx": 0.75, "cy": 0.28, "w": 0.18, "h": 0.12, "vx": -0.0005, "vy": 0.0004},
            {"cls": "Missing Part", "cx": 0.22, "cy": 0.72, "w": 0.10, "h": 0.10, "vx": 0.0006, "vy": -0.0007},
        ]

    @staticmethod
    def severity_for(label: str, conf: float) -> str:
        base = _SEVERITY.get(label, "Low")
        # escalate: very high confidence bumps severity one level
        if conf >= 0.92 and base == "Medium":
            return "Critical"
        if conf >= 0.97 and base == "Low":
            return "Medium"
        return base

    def predict(self, frame, conf: float = 0.45, nms: float = 0.5, frame_index: int = 0) -> List[dict]:
        h, w = frame.shape[:2]
        t = time.time() - self.t0
        out: List[dict] = []
        # wobble each track sinusoidally so boxes drift realistically
        for i, tr in enumerate(self.tracks):
            cx = (tr["cx"] + tr["vx"] * frame_index + 0.02 * __import__("math").sin(t * 0.7 + i)) % 0.92
            cy = min(max(tr["cy"] + tr["vy"] * frame_index + 0.015 * __import__("math").cos(t * 0.9 + i * 2), 0.08), 0.90)
            # detection dropout: simulate intermittent visibility + conf gating
            visibility = 0.55 + 0.45 * __import__("math").sin(t * 0.5 + i * 1.7)
            score = round(max(0.05, min(0.99, 0.62 + 0.25 * visibility + self.rng.uniform(-0.06, 0.06))), 3)
            if score < conf:
                continue
            bw, bh = tr["w"] * w, tr["h"] * h
            x1 = max(0, int(cx * w - bw / 2))
            y1 = max(0, int(cy * h - bh / 2))
            x2 = min(w - 1, int(cx * w + bw / 2))
            y2 = min(h - 1, int(cy * h + bh / 2))
            out.append(
                {
                    "class": tr["cls"],
                    "confidence": score,
                    "severity": self.severity_for(tr["cls"], score),
                    "bbox": [x1, y1, x2, y2],
                    "track_id": i,
                }
            )
        # crude NMS simulation: if overlapping same-class boxes, keep highest conf
        out.sort(key=lambda d: d["confidence"], reverse=True)
        kept: List[dict] = []
        for d in out:
            keep = True
            for k in kept:
                if k["class"] != d["class"]:
                    continue
                ax1, ay1, ax2, ay2 = k["bbox"]
                bx1, by1, bx2, by2 = d["bbox"]
                ix1, iy1 = max(ax1, bx1), max(ay1, by1)
                ix2, iy2 = min(ax2, bx2), min(ay2, by2)
                iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
                inter = iw * ih
                area_b = max(1, (bx2 - bx1) * (by2 - by1))
                if inter / area_b > nms:
                    keep = False
                    break
            if keep:
                kept.append(d)
        return kept
