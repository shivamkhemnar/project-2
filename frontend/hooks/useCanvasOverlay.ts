"use client";
import { useEffect, useRef } from "react";
import type { Detection } from "@/lib/types";
import { SEVERITY_COLOR } from "@/lib/types";

/** Draws the server frame + detection overlays onto a canvas, scaled to fit. */
export function useCanvasOverlay(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  frame: string | null,
  detections: Detection[]
) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      // fit canvas to image aspect
      const maxW = canvas.parentElement?.clientWidth || 960;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const sx = canvas.width / img.width;
      const sy = canvas.height / img.height;
      for (const d of detections) {
        const [x1, y1, x2, y2] = d.bbox;
        const bx = x1 * sx, by = y1 * sy, bw = (x2 - x1) * sx, bh = (y2 - y1) * sy;
        const color = SEVERITY_COLOR[d.severity] || "#22d3ee";
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.shadowColor = color; ctx.shadowBlur = 12;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.shadowBlur = 0;
        const label = `${d.class} ${(d.confidence * 100).toFixed(1)}% · ${d.severity}`;
        ctx.font = "600 12px Inter, sans-serif";
        const tw = ctx.measureText(label).width + 12;
        ctx.fillStyle = color;
        ctx.fillRect(bx, Math.max(0, by - 20), tw, 20);
        ctx.fillStyle = "#0a0e14";
        ctx.fillText(label, bx + 6, Math.max(12, by - 6));
      }
      // HUD crosshair
      ctx.strokeStyle = "rgba(34,211,238,0.25)"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2 - 12, canvas.height / 2);
      ctx.lineTo(canvas.width / 2 + 12, canvas.height / 2);
      ctx.moveTo(canvas.width / 2, canvas.height / 2 - 12);
      ctx.lineTo(canvas.width / 2, canvas.height / 2 + 12);
      ctx.stroke();
    };
    img.src = frame;
    imgRef.current = img;
  }, [canvasRef, frame, detections]);
}
