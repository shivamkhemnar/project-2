"""InspectVision AI — FastAPI entrypoint.

Routes:
  GET  /api/health
  GET  /api/stats            -> hourly counts, category breakdown, latency
  GET  /api/logs             -> filterable, paginated defect logs
  GET  /api/logs/export?fmt=csv|json
  POST /api/upload           -> upload image/video for batch test
  GET  /api/thumbnails/{file}
  WS   /ws/inspect           -> real-time frame + metadata streaming

WebSocket protocol (JSON messages both directions):
  Client -> Server (config): {"type":"config","source":"demo|client-push|video",
                              "conf":0.45,"nms":0.5,"session_id":"...","video_path":"..."}
  Client -> Server (frame):  {"type":"frame","image":"data:image/jpeg;base64,...","frame_index":12}
  Server -> Client (result): {"type":"result","frame":"data:image/jpeg;base64,...",
                              "detections":[...],"fps":29.7,"inference_ms":12.3,
                              "frame_index":12,"timestamp":"...","alert":null|{...}}
  Server -> Client (alert):  {"type":"alert", ...} instant critical trigger
"""
import asyncio
import base64
import csv
import io
import time
import uuid
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import THUMBNAIL_DIR, UPLOAD_DIR, get_settings
from .models import DefectLog, InspectionSession, SessionLocal, get_db, init_db
from .vision.detector import DefectDetector

settings = get_settings()
app = FastAPI(title=settings.app_name, version=settings.version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
detector = DefectDetector()

# ---- in-memory telemetry ring buffers (last 120 samples) ----
telemetry = {
    "fps": deque(maxlen=120),
    "inference_ms": deque(maxlen=120),
    "render_ms": deque(maxlen=120),
}
telemetry_lock = asyncio.Lock()

# Active server-side video captures keyed by session
_video_caps: dict[str, cv2.VideoCapture] = {}


class UploadResponse(BaseModel):
    filename: str
    path: str
    kind: str


@app.get("/api/health")
def health():
    return {"status": "ok", "app": settings.app_name, "version": settings.version,
            "backend": detector.backend, "device": detector.device}


@app.get("/api/classes")
def classes():
    return {"classes": settings.defect_classes}


@app.post("/api/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    suffix = Path(file.filename or "upload.bin").suffix.lower()
    kind = "image" if suffix in {".jpg", ".jpeg", ".png", ".bmp", ".webp"} else "video" if suffix in {".mp4", ".avi", ".mov", ".mkv"} else "other"
    if kind == "other":
        raise HTTPException(400, "Only image (jpg/png/webp) or video (mp4/avi/mov/mkv) uploads are supported.")
    dest = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    dest.write_bytes(content)
    return UploadResponse(filename=file.filename or dest.name, path=dest.name, kind=kind)


@app.get("/api/uploads/{name}")
def serve_upload(name: str):
    p = UPLOAD_DIR / name
    if not p.exists():
        raise HTTPException(404, "file not found")
    return FileResponse(str(p))


@app.get("/api/thumbnails/{name}")
def serve_thumbnail(name: str):
    p = THUMBNAIL_DIR / name
    if not p.exists():
        raise HTTPException(404, "thumbnail not found")
    return FileResponse(str(p))


@app.post("/api/detect-image")
async def detect_image(
    file: UploadFile = File(...),
    conf: float = Query(0.45, ge=0.05, le=1.0),
    nms: float = Query(0.5, ge=0.1, le=1.0),
    db: Session = Depends(get_db),
):
    """Single-image batch test: run YOLO (or MockYOLO) synchronously.

    Returns detections + annotated JPEG data-URL. Also persists defects to DB.
    """
    raw = await file.read()
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(400, "could not decode image — upload a valid jpg/png/webp")
    dets, infer_ms = detector.predict(frame, conf=conf, nms=nms)
    session_id = f"batch-{uuid.uuid4().hex[:6]}"
    if dets:
        await asyncio.to_thread(
            _persist, db, session_id=session_id, source="batch-image",
            frame=frame, dets=dets, frame_index=0, inference_ms=infer_ms,
        )
    # annotate for preview
    annotated = frame.copy()
    for d in dets:
        x1, y1, x2, y2 = (int(v) for v in d["bbox"])
        color = {"Low": (16, 185, 129), "Medium": (245, 158, 11), "Critical": (239, 68, 68)}.get(d["severity"], (34, 211, 238))
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        cv2.putText(annotated, f"{d['class']} {d['confidence']*100:.1f}%", (x1, max(0, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
    return {
        "detections": dets,
        "inference_ms": round(infer_ms, 2),
        "frame": _frame_to_b64(annotated),
        "backend": detector.backend,
        "session_id": session_id,
    }


if THUMBNAIL_DIR.exists():
    app.mount("/thumbnails", StaticFiles(directory=str(THUMBNAIL_DIR)), name="thumbnails")


@app.get("/api/logs")
def list_logs(
    db: Session = Depends(get_db),
    severity: Optional[str] = Query(None),
    defect_class: Optional[str] = Query(None, alias="class"),
    session_id: Optional[str] = Query(None),
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    since = datetime.utcnow() - timedelta(hours=hours)
    q = db.query(DefectLog).filter(DefectLog.timestamp >= since)
    if severity:
        q = q.filter(DefectLog.severity == severity)
    if defect_class:
        q = q.filter(DefectLog.class_label == defect_class)
    if session_id:
        q = q.filter(DefectLog.session_id == session_id)
    total = q.count()
    rows = q.order_by(DefectLog.timestamp.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id, "timestamp": r.timestamp.isoformat(), "frame_index": r.frame_index,
                "session_id": r.session_id, "source": r.source, "class": r.class_label,
                "confidence": r.confidence, "severity": r.severity,
                "bbox": [r.x1, r.y1, r.x2, r.y2], "inference_ms": r.inference_ms,
                "thumbnail": f"/api/thumbnails/{Path(r.thumbnail_path).name}" if r.thumbnail_path else None,
            }
            for r in rows
        ],
    }


@app.get("/api/logs/export")
def export_logs(db: Session = Depends(get_db), fmt: str = "csv", hours: int = 24):
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = db.query(DefectLog).filter(DefectLog.timestamp >= since).order_by(DefectLog.timestamp.desc()).limit(5000).all()
    if fmt == "json":
        return JSONResponse([
            {"timestamp": r.timestamp.isoformat(), "class": r.class_label, "confidence": r.confidence,
             "severity": r.severity, "bbox": [r.x1, r.y1, r.x2, r.y2], "frame_index": r.frame_index,
             "session_id": r.session_id} for r in rows
        ])
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["timestamp", "session_id", "source", "class", "confidence", "severity", "x1", "y1", "x2", "y2", "frame_index"])
    for r in rows:
        w.writerow([r.timestamp.isoformat(), r.session_id, r.source, r.class_label, r.confidence, r.severity, r.x1, r.y1, r.x2, r.y2, r.frame_index])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=inspection_log.csv"})


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    # hourly defect rate (last 12h)
    hourly = []
    for h in range(11, -1, -1):
        start = now - timedelta(hours=h + 1)
        end = now - timedelta(hours=h)
        c = db.query(func.count(DefectLog.id)).filter(DefectLog.timestamp >= start, DefectLog.timestamp < end).scalar() or 0
        hourly.append({"hour": (now - timedelta(hours=h)).strftime("%H:00"), "defects": c})
    # category breakdown (last 24h)
    since = now - timedelta(hours=24)
    cat_rows = db.query(DefectLog.class_label, func.count(DefectLog.id)).filter(DefectLog.timestamp >= since).group_by(DefectLog.class_label).all()
    categories = [{"name": k or "Unknown", "value": v} for k, v in cat_rows] or [{"name": "No defects", "value": 1}]
    sev_rows = db.query(DefectLog.severity, func.count(DefectLog.id)).filter(DefectLog.timestamp >= since).group_by(DefectLog.severity).all()
    by_severity = {k: v for k, v in sev_rows}
    total = db.query(func.count(DefectLog.id)).filter(DefectLog.timestamp >= since).scalar() or 0
    passes = max(0, 1000 - total)  # demo efficiency denominator
    efficiency = round(100 * passes / max(1, passes + total), 1)
    async def _tl():
        async with telemetry_lock:
            return {
                "fps": list(telemetry["fps"])[-30:],
                "inference_ms": list(telemetry["inference_ms"])[-30:],
                "render_ms": list(telemetry["render_ms"])[-30:],
            }
    # telemetry read synchronously (deque ops are atomic enough here)
    return {
        "hourly": hourly,
        "categories": categories,
        "by_severity": by_severity,
        "total_24h": total,
        "efficiency": efficiency,
        "latency": {
            "inference_ms": list(telemetry["inference_ms"])[-30:],
            "render_ms": list(telemetry["render_ms"])[-30:],
        },
        "fps_history": list(telemetry["fps"])[-30:],
        "backend": detector.backend,
        "device": detector.device,
    }


# ---------------- WebSocket engine ----------------

def _b64_to_frame(data_url: str) -> np.ndarray:
    b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw = base64.b64decode(b64)
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("could not decode frame")
    return frame


def _frame_to_b64(frame: np.ndarray) -> str:
    jpeg = DefectDetector.encode_jpeg(frame, quality=settings.jpeg_quality, max_width=settings.max_frame_width)
    return "data:image/jpeg;base64," + base64.b64encode(jpeg).decode("ascii")


def _demo_frame(w: int = 960, h: int = 540) -> np.ndarray:
    """Synthetic conveyor-belt frame so demo works with zero hardware."""
    t = time.time()
    frame = np.full((h, w, 3), 24, dtype=np.uint8)
    cv2.rectangle(frame, (0, 0), (w, h), (38, 38, 44), -1)
    # moving belt slats
    offset = int((t * 120) % 80)
    for x in range(-80 + offset, w + 80, 80):
        cv2.line(frame, (x, 0), (x - 40, h), (58, 58, 66), 3)
    # part silhouette in centre
    cx, cy = w // 2, h // 2
    cv2.rectangle(frame, (cx - 180, cy - 110), (cx + 180, cy + 110), (74, 78, 90), -1)
    cv2.rectangle(frame, (cx - 180, cy - 110), (cx + 180, cy + 110), (120, 128, 140), 2)
    cv2.putText(frame, "PART A-42", (cx - 70, cy + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 205, 215), 2)
    # brushed-metal noise
    noise = np.random.randint(0, 18, (h, w, 1), dtype=np.uint8)
    frame = cv2.add(frame, np.repeat(noise, 3, axis=2))
    # scan line
    sy = int((t * 200) % h)
    cv2.line(frame, (0, sy), (w, sy), (34, 211, 238), 1)
    return frame


def _persist(db: Session, *, session_id: str, source: str, frame: np.ndarray,
             dets: list, frame_index: int, inference_ms: float):
    for d in dets:
        thumb_name = None
        if settings.save_thumbnails:
            try:
                crop = DefectDetector.crop_thumbnail(frame, d["bbox"])
                thumb_name = f"{session_id}_{frame_index}_{uuid.uuid4().hex[:6]}.jpg"
                ok, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                if ok:
                    (THUMBNAIL_DIR / thumb_name).write_bytes(buf.tobytes())
            except Exception:
                thumb_name = None
        x1, y1, x2, y2 = d["bbox"]
        db.add(DefectLog(
            timestamp=datetime.utcnow(), frame_index=frame_index, session_id=session_id,
            source=source, class_label=d["class"], confidence=d["confidence"],
            severity=d["severity"], x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2),
            inference_ms=inference_ms, thumbnail_path=thumb_name,
        ))
    try:
        db.commit()
    except Exception:
        db.rollback()


@app.websocket("/ws/inspect")
async def ws_inspect(ws: WebSocket):
    await ws.accept()
    db = SessionLocal()
    session_id = uuid.uuid4().hex[:8]
    source = "demo"
    conf = settings.default_conf
    nms = settings.default_nms
    video_path: Optional[str] = None
    cap: Optional[cv2.VideoCapture] = None
    frame_index = 0
    last = time.perf_counter()
    try:
        # ensure session row
        db.add(InspectionSession(session_id=session_id, source=source))
        db.commit()
        while True:
            try:
                msg = await asyncio.wait_for(ws.receive_json(), timeout=5.0)
            except asyncio.TimeoutError:
                msg = {"type": "tick"}  # keep streaming demo frames on idle
            mtype = msg.get("type")
            if mtype == "config":
                source = str(msg.get("source", "demo"))
                conf = float(msg.get("conf", conf))
                conf = min(max(conf, 0.05), 1.0)
                nms = float(msg.get("nms", nms))
                nms = min(max(nms, 0.1), 1.0)
                session_id = str(msg.get("session_id", session_id))
                video_path = msg.get("video_path")
                if cap is not None:
                    cap.release()
                    cap = None
                if source == "video" and video_path:
                    p = (UPLOAD_DIR / Path(video_path).name) if not Path(str(video_path)).exists() else Path(str(video_path))
                    if p.exists():
                        cap = cv2.VideoCapture(str(p))
                    else:
                        await ws.send_json({"type": "error", "message": f"video not found: {video_path}"})
                        source = "demo"
                elif source == "webcam":
                    cap = cv2.VideoCapture(0)
                    if not cap.isOpened():
                        await ws.send_json({"type": "error", "message": "server webcam unavailable, using demo feed"})
                        cap = None
                        source = "demo"
                await ws.send_json({"type": "ready", "session_id": session_id, "source": source, "backend": detector.backend})
                continue
            # ---- acquire frame ----
            frame: Optional[np.ndarray] = None
            if mtype == "frame" and msg.get("image"):
                try:
                    frame = _b64_to_frame(msg["image"])
                    if "frame_index" in msg:
                        frame_index = int(msg["frame_index"])
                except Exception as e:
                    await ws.send_json({"type": "error", "message": f"bad frame: {e}"})
                    continue
                source_eff = "client-push"
            elif source == "video" and cap is not None:
                ok, f = cap.read()
                if not ok:  # loop video
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, f = cap.read()
                    if not ok:
                        frame = _demo_frame()
                    else:
                        frame = f
                else:
                    frame = f
                source_eff = "video"
            elif source == "webcam" and cap is not None:
                ok, f = cap.read()
                frame = f if ok else _demo_frame()
                source_eff = "webcam"
            else:
                frame = _demo_frame()
                source_eff = "demo"
            # ---- inference ----
            dets, infer_ms = detector.predict(frame, conf=conf, nms=nms)
            now = time.perf_counter()
            fps = 1.0 / max(1e-6, now - last)
            last = now
            async with telemetry_lock:
                telemetry["fps"].append(round(fps, 1))
                telemetry["inference_ms"].append(round(infer_ms, 1))
                telemetry["render_ms"].append(round(2.5, 1))
            # ---- alert ----
            alert = None
            for d in dets:
                if d["severity"] == "Critical" and d["confidence"] >= settings.critical_conf_threshold:
                    alert = {"class": d["class"], "confidence": d["confidence"], "severity": d["severity"], "bbox": d["bbox"]}
                    await ws.send_json({"type": "alert", "session_id": session_id, "frame_index": frame_index,
                                        "timestamp": datetime.utcnow().isoformat(), "detection": alert})
                    break
            # ---- persist (only frames with detections, throttled) ----
            if dets and frame_index % 3 == 0:
                await asyncio.to_thread(_persist, db, session_id=session_id, source=source_eff,
                                        frame=frame, dets=dets, frame_index=frame_index,
                                        inference_ms=infer_ms)
            frame_index += 1
            # ---- stream back ----
            await ws.send_json({
                "type": "result",
                "session_id": session_id,
                "frame": _frame_to_b64(frame),
                "detections": dets,
                "fps": round(fps, 1),
                "inference_ms": round(infer_ms, 1),
                "frame_index": frame_index,
                "timestamp": datetime.utcnow().isoformat(),
                "alert": alert,
                "backend": detector.backend,
            })
            # throttle to max_fps
            await asyncio.sleep(max(0, (1.0 / settings.max_fps) - 0.005))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
            await ws.close()
        except Exception:
            pass
    finally:
        try:
            if cap is not None:
                cap.release()
        except Exception:
            pass
        db.close()
