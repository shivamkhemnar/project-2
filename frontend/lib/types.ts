export type Severity = "Low" | "Medium" | "Critical";

export interface Detection {
  class: string;
  confidence: number;
  severity: Severity;
  bbox: [number, number, number, number];
  track_id?: number;
}

export interface WSResult {
  type: "result";
  session_id: string;
  frame: string; // data URL jpeg
  detections: Detection[];
  fps: number;
  inference_ms: number;
  frame_index: number;
  timestamp: string;
  alert: Detection | null;
  backend: string;
}

export type SourceMode = "demo" | "client-push" | "webcam" | "video";

export interface LogItem {
  id: number;
  timestamp: string;
  frame_index: number;
  session_id: string;
  source: string;
  class: string;
  confidence: number;
  severity: Severity;
  bbox: number[];
  inference_ms: number;
  thumbnail: string | null;
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  Low: "#10b981",
  Medium: "#f59e0b",
  Critical: "#ef4444"
};
