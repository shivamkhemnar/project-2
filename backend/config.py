"""Central configuration for InspectVision AI backend."""
from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
THUMBNAIL_DIR = STORAGE_DIR / "thumbnails"
UPLOAD_DIR = STORAGE_DIR / "uploads"
for d in (STORAGE_DIR, THUMBNAIL_DIR, UPLOAD_DIR):
    d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    app_name: str = "InspectVision AI"
    version: str = "1.0.0"
    api_prefix: str = "/api"

    # Inference
    model_path: str = "yolov8n.pt"  # override with custom defect weights, e.g. runs/detect/defects/weights/best.pt
    device: str = "auto"  # auto | cpu | cuda | cuda:0
    imgsz: int = 640
    default_conf: float = 0.45
    default_nms: float = 0.50
    max_fps: int = 30

    # Streaming
    jpeg_quality: int = 80
    max_frame_width: int = 960

    # Alerts
    critical_conf_threshold: float = 0.85

    # Persistence
    database_url: str = f"sqlite:///{(BASE_DIR / 'inspectvision.db').as_posix()}"
    save_thumbnails: bool = True

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Defect taxonomy (must match detector CLASSES)
    defect_classes: list[str] = ["Scratch", "Dent", "Crack", "Discoloration", "Missing Part"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
