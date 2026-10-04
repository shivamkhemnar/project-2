"use client";
import { useState } from "react";
import { StatusHeader } from "@/components/StatusHeader";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { useInspectWS } from "@/hooks/useWebSocket";

export default function AnalyticsPage() {
  const [audioAlert, setAudioAlert] = useState(true);
  const { connected, fps, inferMs, backend } = useInspectWS({
    source: "demo", conf: 0.45, nms: 0.5, running: false, audioAlert
  });
  return (
    <div className="min-h-screen">
      <StatusHeader connected={connected} fps={fps} inferMs={inferMs} backend={backend} audioAlert={audioAlert} setAudioAlert={setAudioAlert} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="text-xl font-extrabold">Telemetry & <span className="text-cyan-300">Analytics</span></h2>
        <p className="mb-4 font-mono text-xs text-zinc-500">auto-refreshes every 5s from /api/stats</p>
        <AnalyticsCharts />
      </main>
    </div>
  );
}
