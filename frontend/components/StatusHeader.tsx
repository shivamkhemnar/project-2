"use client";
import { Activity, Cpu, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";

interface Props {
  connected: boolean; fps: number; inferMs: number; backend: string;
  audioAlert: boolean; setAudioAlert: (v: boolean) => void;
}

export function StatusHeader(p: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-industrial-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-emerald-500 font-black text-black">IV</div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wide">INSPECTVISION <span className="text-cyan-300">AI</span></h1>
            <p className="font-mono text-[10px] uppercase text-zinc-500">Industrial Defect Detection · v1.0</p>
          </div>
        </div>
        <nav className="ml-4 flex gap-1 text-xs font-semibold">
          <Link href="/" className="rounded-lg bg-white/10 px-3 py-1.5 text-white">Inspection</Link>
          <Link href="/analytics" className="rounded-lg px-3 py-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">Analytics</Link>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            <Activity className="h-3 w-3 text-emerald-400" />{p.fps.toFixed(0)} FPS
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            <Cpu className="h-3 w-3 text-cyan-300" />{p.inferMs.toFixed(1)}ms · {p.backend}
          </span>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${p.connected ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-zinc-600 bg-white/5 text-zinc-500"}`}>
            {p.connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {p.connected ? "STREAM LIVE" : "OFFLINE"}
          </span>
          <button onClick={() => p.setAudioAlert(!p.audioAlert)}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300 hover:border-cyan-400/40">
            {p.audioAlert ? <Volume2 className="h-3 w-3 text-cyan-300" /> : <VolumeX className="h-3 w-3" />}
            {p.audioAlert ? "ALERTS ON" : "MUTED"}
          </button>
        </div>
      </div>
    </header>
  );
}
