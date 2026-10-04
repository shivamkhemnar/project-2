# InspectVision AI — Backend (FastAPI + YOLO)
# CPU default. For NVIDIA GPU: use base `nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04`
# and install torch CUDA wheels, then enable `deploy.resources.reservations` in compose.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# OpenCV runtime deps (headless still needs libgl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend ./backend

# persistent storage for sqlite db / uploads / thumbnails
VOLUME ["/app/backend/storage"]
EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--ws", "websockets"]
