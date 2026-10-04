"use client";
import { Camera, Film, MonitorPlay, Play, Square, Upload } from "lucide-react";
import type { SourceMode } from "@/lib/types";
import { clsx } from "@/lib/api";

interface Props {
  source: SourceMode;
  setSource: (s: SourceMode) => void;
  conf: number; setConf: (v: number) => void;
  nms: number; setNms: (v: number) => void;
  running: boolean; setRunning: (v: boolean) => void;
  onUpload: (f: File) => void;
}

const SOURCES: { id: SourceMode; label: string; icon: any }[] = [
  { id: "demo", label: "Demo Belt", icon: MonitorPlay },
  { id: "client-push", label: "Webcam", icon: Camera },
  { id: "webcam", label: "Server Cam", icon: Film },
  { id: "video", label: "Video File", icon: Upload }
];

export function ControlsBar(p: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-industrial-900/80 p-4 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map(s => (
          <button key={s.id} onClick={() => p.setSource(s.id)}
            className={clsx("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              p.source === s.id ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20")}>
            <s.icon className="h-3.5 w-3.5" />{s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:border-cyan-400/40">
            Upload sample
            <input type="file" className="hidden" accept="image/*,video/*" onChange={e => e.target.files?.[0] && p.onUpload(e.target.files[0])} />
          </label>
          <button onClick={() => p.setRunning(!p.running)}
            className={clsx("flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold",
              p.running ? "bg-red-500/90 text-white hover:bg-red-500" : "bg-emerald-500/90 text-black hover:bg-emerald-400")}>
            {p.running ? <><Square className="h-3.5 w-3.5" /> STOP</> : <><Play className="h-3.5 w-3.5" /> START INSPECTION</>}
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex justify-between text-xs font-mono text-zinc-400">
            <span>CONFIDENCE THRESHOLD</span><span className="text-cyan-300">{p.conf.toFixed(2)}</span>
          </div>
          <input type="range" min={0.1} max={1} step={0.01} value={p.conf} onChange={e => p.setConf(+e.target.value)} className="w-full" />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs font-mono text-zinc-400">
            <span>NMS / IoU THRESHOLD</span><span className="text-cyan-300">{p.nms.toFixed(2)}</span>
          </div>
          <input type="range" min={0.1} max={1} step={0.01} value={p.nms} onChange={e => p.setNms(+e.target.value)} className="w-full" />
        </div>
      </div>
    </div>
  );
}
