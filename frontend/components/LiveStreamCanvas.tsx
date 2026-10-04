"use client";
import { useRef } from "react";
import { useCanvasOverlay } from "@/hooks/useCanvasOverlay";
import type { Detection } from "@/lib/types";
import { ScanLine } from "lucide-react";

export function LiveStreamCanvas({ frame, detections, running }: { frame: string | null; detections: Detection[]; running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasOverlay(ref, frame, detections);
  return (
    <div className="scanlines relative overflow-hidden rounded-xl border border-cyan-500/20 bg-industrial-900">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-cyan-300">
          <span className={`inline-block h-2 w-2 rounded-full ${running ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
          Live Feed · CH-01 · Conveyor A
        </div>
        <div className="text-[11px] font-mono text-zinc-500">{detections.length} detections</div>
      </div>
      {!frame ? (
        <div className="flex h-[420px] flex-col items-center justify-center gap-3 text-zinc-500">
          <ScanLine className="h-10 w-10 text-cyan-500/40" />
          <p className="font-mono text-sm">{running ? "Connecting to inference engine…" : "Press Start Inspection to begin"}</p>
        </div>
      ) : (
        <canvas ref={ref} className="mx-auto block max-h-[520px] w-full" />
      )}
    </div>
  );
}
