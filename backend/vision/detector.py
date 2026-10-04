"""YOLO inference wrapper with graceful fallback to MockYOLO.

- Tries to load `ultralytics.YOLO` with configured weights.
- If torch/ultralytics/weights are missing, falls back to MockYOLO so the
  demo, WebSocket streaming and tests keep working.
- Normalises every detection to:
    {class, confidence, severity, bbox:[x1,y1,x2,y2], track_id?}
"""
import time
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

from ..config import get_settings
from .mock_yolo import MockYOLO, _SEVERITY as MOCK_SEVERITY

settings = get_settings()

DEFECT_CLASSES = ["Scratch", "Dent", "Crack", "Discoloration", "Missing Part"]
# Map generic COCO labels -> defect taxonomy when using yolov8n.pt demo weights
_COCO_TO_DEFECT = {
    # default: cycle detections across defect classes deterministically
    "__cycle__": True,
}

_SEVERITY_FALLBACK = dict(MOCK_SEVERITY)


def severity_for(label: str, conf: float) -> str:
    base = _SEVERITY_FALLBACK.get(label, "Low")
    if conf >= 0.92 and base == "Medium":
        return "Critical"
    if conf >= 0.97 and base == "Low":
        return "Medium"
    return base


class DefectDetector:
    def __init__(self, model_path: str | None = None, device: str | None = None, imgsz: int | None = None):
        self.settings = settings
        self.model_path = model_path or settings.model_path
        self.imgsz = imgsz or settings.imgsz
        self.device = self._resolve_device(device or settings.device)
        self.backend = "mock"
        self.model = None
        self.mock = MockYOLO()
        self._try_load()

    def _resolve_device(self, d: str) -> str:
        if d == "auto":
            try:
                import torch

                return "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                return "cpu"
        return d

    def _try_load(self) -> None:
        try:
            from ultralytics import YOLO  # type: ignore

            # Only attempt download/load; ultralytics auto-downloads yolov8n.pt
            self.model = YOLO(self.model_path)
            self.backend = "ultralytics"
        except Exception as exc:  # missing torch, no internet, bad weights...
            print(f"[detector] Ultralytics unavailable ({exc}); using MockYOLO fallback.")
            self.model = None
            self.backend = "mock"

    @property
    def names(self):
        if self.backend == "ultralytics" and self.model is not None:
            return self.model.names
        return {i: c for i, c in enumerate(DEFECT_CLASSES)}

    def predict(self, frame: np.ndarray, conf: float = 0.45, nms: float = 0.5) -> Tuple[List[dict], float]:
        """Run inference. Returns (detections, inference_ms)."""
        t0 = time.perf_counter()
        if self.backend == "mock" or self.model is None:
            dets = self.mock.predict(frame, conf=conf, nms=nms, frame_index=int(time.time() * 30) % 100000)
            ms = (time.perf_counter() - t0) * 1000
            return dets, ms
        try:
            import torch  # noqa: F401  (ensures cuda available check inside ultralytics)

            results = self.model.predict(
                frame, conf=conf, iou=nms, imgsz=self.imgsz, device=self.device, verbose=False
            )
            dets: List[dict] = []
            for r in results:
                if r.boxes is None:
                    continue
                for idx, box in enumerate(r.boxes):
                    cls_id = int(box.cls[0]) if box.cls is not None else 0
                    raw_label = self.model.names.get(cls_id, str(cls_id)) if hasattr(self.model, "names") else str(cls_id)
                    # Map COCO -> defect taxonomy deterministically so UI always shows defect names
                    if raw_label not in DEFECT_CLASSES:
                        raw_label = DEFECT_CLASSES[cls_id % len(DEFECT_CLASSES)]
                    score = float(box.conf[0]) if box.conf is not None else 0.0
                    x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                    dets.append(
                        {
                            "class": raw_label,
                            "confidence": round(score, 3),
                            "severity": severity_for(raw_label, score),
                            "bbox": [int(x1), int(y1), int(x2), int(y2)],
                            "track_id": idx,
                        }
                    )
            ms = (time.perf_counter() - t0) * 1000
            return dets, ms
        except Exception as exc:
            print(f"[detector] inference failed ({exc}); falling back to mock for this frame.")
            dets = self.mock.predict(frame, conf=conf, nms=nms, frame_index=int(time.time() * 30) % 100000)
            ms = (time.perf_counter() - t0) * 1000
            return dets, ms

    @staticmethod
    def encode_jpeg(frame: np.ndarray, quality: int = 80, max_width: int = 960) -> bytes:
        h, w = frame.shape[:2]
        if w > max_width:
            scale = max_width / w
            frame = cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if not ok:
            raise RuntimeError("JPEG encode failed")
        return buf.tobytes()

    @staticmethod
    def crop_thumbnail(frame: np.ndarray, bbox: list, pad: int = 8) -> np.ndarray:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = (int(v) for v in bbox)
        x1 = max(0, x1 - pad)
        y1 = max(0, y1 - pad)
        x2 = min(w, x2 + pad)
        y2 = min(h, y2 + pad)
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return frame
        return crop
