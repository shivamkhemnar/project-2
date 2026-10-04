"""SQLAlchemy models for defect logging."""
from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import get_settings

settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


class DefectLog(Base):
    __tablename__ = "defect_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    frame_index = Column(Integer, default=0, nullable=False)
    session_id = Column(String(64), default="default", index=True)
    source = Column(String(64), default="demo")
    class_label = Column(String(64), index=True, nullable=False)
    confidence = Column(Float, nullable=False)
    severity = Column(String(16), index=True, nullable=False)  # Low | Medium | Critical
    x1 = Column(Float, nullable=False)
    y1 = Column(Float, nullable=False)
    x2 = Column(Float, nullable=False)
    y2 = Column(Float, nullable=False)
    inference_ms = Column(Float, default=0.0)
    thumbnail_path = Column(String(256), nullable=True)
    notes = Column(Text, nullable=True)


class InspectionSession(Base):
    __tablename__ = "inspection_sessions"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(64), unique=True, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    source = Column(String(64), default="demo")
    total_frames = Column(Integer, default=0)
    total_defects = Column(Integer, default=0)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
