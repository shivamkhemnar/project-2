"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/api";
import type { Detection, SourceMode, WSResult } from "@/lib/types";

interface UseWSOpts {
  source: SourceMode;
  conf: number;
  nms: number;
  videoPath?: string;
  running: boolean;
  audioAlert: boolean;
  onAlert?: (d: Detection) => void;
}

export function useInspectWS({ source, conf, nms, videoPath, running, audioAlert, onAlert }: UseWSOpts) {
  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pushTimer = useRef<number | null>(null);
  const frameIdx = useRef(0);
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [fps, setFps] = useState(0);
  const [inferMs, setInferMs] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [backend, setBackend] = useState("?");
  const [log, setLog] = useState<(Detection & { timestamp: string; frame_index: number })[]>([]);
  const alertAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    alertAudio.current = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
    );
  }, []);

  const playAlert = useCallback(() => {
    if (!audioAlert) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = "square";
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      o.start(); o.stop(ctx.currentTime + 0.18);
    } catch { /* audio unavailable */ }
  }, [audioAlert]);

  // ---- client webcam capture loop (client-push mode) ----
  const startClientCam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540 } });
      const v = document.createElement("video");
      v.srcObject = stream; v.muted = true;
      await v.play();
      videoRef.current = v;
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 360;
      const g = canvas.getContext("2d")!;
      const tick = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN && v.readyState >= 2) {
          g.drawImage(v, 0, 0, 640, 360);
          wsRef.current.send(JSON.stringify({
            type: "frame",
            image: canvas.toDataURL("image/jpeg", 0.7),
            frame_index: frameIdx.current++
          }));
        }
        pushTimer.current = window.setTimeout(tick, 100); // ~10fps upstream (server renders up to 30fps)
      };
      tick();
    } catch (e) {
      console.warn("webcam unavailable", e);
    }
  }, []);

  const stopClientCam = useCallback(() => {
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    const v = videoRef.current;
    if (v?.srcObject) (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    videoRef.current = null;
  }, []);

  useEffect(() => {
    if (!running) {
      wsRef.current?.close();
      setConnected(false);
      stopClientCam();
      return;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "config", source, conf, nms, video_path: videoPath }));
      if (source === "client-push") startClientCam();
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "result") {
          const r = m as WSResult;
          setFrame(r.frame);
          setDetections(r.detections);
          setFps(r.fps); setInferMs(r.inference_ms);
          setFrameIndex(r.frame_index); setBackend(r.backend);
          if (r.detections.length) {
            setLog(prev => [...r.detections.map(d => ({ ...d, timestamp: r.timestamp, frame_index: r.frame_index })), ...prev].slice(0, 200));
          }
          if (r.alert) { playAlert(); onAlert?.(r.alert); }
        } else if (m.type === "alert") {
          playAlert(); onAlert?.(m.detection);
        }
      } catch { /* ignore malformed */ }
    };
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => { ws.close(); stopClientCam(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, source]);

  // live-update thresholds without reconnect
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "config", source, conf, nms, video_path: videoPath }));
    }
  }, [conf, nms, source, videoPath]);

  return { connected, frame, detections, fps, inferMs, frameIndex, backend, log };
}
