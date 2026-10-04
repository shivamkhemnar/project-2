"use client";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Download, ScanEye } from "lucide-react";
import { StatusHeader } from "@/components/StatusHeader";
import { LiveStreamCanvas } from "@/components/LiveStreamCanvas";
import { InspectionLogs } from "@/components/InspectionLogs";
import { ControlsBar } from "@/components/ControlsBar";
import { AlertModal } from "@/components/AlertModal";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { useInspectWS } from "@/hooks/useWebSocket";
import { API_URL, fetchLogs, uploadFile } from "@/lib/api";
import type { Detection, LogItem, SourceMode } from "@/lib/types";

export default function InspectionPage() {
  const [source, setSource] = useState<SourceMode>("demo");
  const [conf, setConf] = useState(0.45);
  const [nms, setNms] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [audioAlert, setAudioAlert] = useState(true);
  const [alert, setAlert] = useState<Detection | null>(null);
  const [tab, setTab] = useState<"inspect" | "analytics">("inspect");
  const [videoPath, setVideoPath] = useState<string | undefined>(undefined);

  // archived logs (persisted DB) with filters
  const [archive, setArchive] = useState<LogItem[]>([]);
  const [sevFilter, setSevFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");

  const onAlert = useCallback((d: Detection) => setAlert(d), []);
  const ws = useInspectWS({ source, conf, nms, videoPath, running, audioAlert, onAlert });

  const refreshArchive = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { limit: 50, hours: 24 };
      if (sevFilter) params.severity = sevFilter;
      if (classFilter) params.class = classFilter;
      const j = await fetchLogs(params);
      setArchive(j.items ?? []);
    } catch {
      /* backend offline — live log still works once connected */
    }
  }, [sevFilter, classFilter]);

  useEffect(() => {
    refreshArchive();
    const t = setInterval(refreshArchive, 8000);
    return () => clearInterval(t);
  }, [refreshArchive]);

  const handleUpload = async (f: File) => {
    try {
      const res = await uploadFile(f);
      if (res.kind === "video") {
        setVideoPath(res.path);
        setSource("video");
        setRunning(true);
      } else if (res.kind === "image") {
        // single-image batch test: run synchronous detection endpoint
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch(`${API_URL}/api/detect-image?conf=${conf}`, { method: "POST", body: fd });
        const j = await r.json();
        if (j.detections?.length) {
          // surface as log + alert if critical
          const crit = j.detections.find((d: Detection) => d.severity === "Critical" && d.confidence >= 0.85);
          if (crit) setAlert(crit);
        }
        alert(`Batch test: ${j.detections?.length ?? 0} defect(s) in ${f.name} (backend: ${j.backend})`);
        refreshArchive();
      }
    } catch (e: any) {
      alert(`Upload failed: ${e?.message || e}`);
    }
  };

  return (
    <div className="min-h-screen bg-industrial-950">
      <StatusHeader
        connected={ws.connected}
        fps={ws.fps}
        inferMs={ws.inferMs}
        backend={ws.backend}
        audioAlert={audioAlert}
        setAudioAlert={setAudioAlert}
      />

      <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-4">
        {/* tab switch */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("inspect")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "inspect" ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-zinc-500 hover:text-zinc-300"}`}>
            <ScanEye className="h-4 w-4" /> LIVE INSPECTION
          </button>
          <button
            onClick={() => setTab("analytics")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${tab === "analytics" ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-zinc-500 hover:text-zinc-300"}`}>
            <BarChart3 className="h-4 w-4" /> ANALYTICS & TELEMETRY
          </button>
          <div className="ml-auto hidden font-mono text-[11px] text-zinc-600 md:block">
            session frame #{ws.frameIndex} · backend: {ws.backend} · conf {conf.toFixed(2)} · nms {nms.toFixed(2)}
          </div>
        </div>

        {tab === "inspect" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <ControlsBar
              source={source} setSource={setSource}
              conf={conf} setConf={setConf}
              nms={nms} setNms={setNms}
              running={running} setRunning={setRunning}
              onUpload={handleUpload}
            />
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <LiveStreamCanvas frame={ws.frame} detections={ws.detections} running={running} />
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {[
                    { l: "FPS", v: ws.fps.toFixed(1), c: "#22d3ee" },
                    { l: "INFERENCE", v: `${ws.inferMs.toFixed(1)} ms`, c: "#f59e0b" },
                    { l: "FRAME", v: `#${ws.frameIndex}`, c: "#10b981" },
                  ].map((s) => (
                    <div key={s.l} className="rounded-xl border border-white/10 bg-industrial-900/80 px-4 py-3">
                      <div className="font-mono text-[10px] tracking-widest text-zinc-500">{s.l}</div>
                      <div className="text-xl font-black tabular-nums" style={{ color: s.c }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <InspectionLogs log={ws.log} />
            </div>

            {/* archived / persisted logs */}
            <div className="rounded-xl border border-white/10 bg-industrial-900/80 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-white">Archived Defect Logs</h2>
                <span className="font-mono text-[11px] text-zinc-500">persisted in SQLite/Postgres · auto-saved thumbnails</span>
                <div className="ml-auto flex items-center gap-2">
                  <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-zinc-300">
                    <option value="">All severities</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="Critical">Critical</option>
                  </select>
                  <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-zinc-300">
                    <option value="">All classes</option>
                    <option>Scratch</option><option>Dent</option><option>Crack</option>
                    <option>Discoloration</option><option>Missing Part</option>
                  </select>
                  <a href={`${API_URL}/api/logs/export?fmt=csv`}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-cyan-400/40">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </a>
                  <a href={`${API_URL}/api/logs/export?fmt=json`}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-cyan-400/40">
                    <Download className="h-3.5 w-3.5" /> JSON
                  </a>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-[11px]">
                  <thead>
                    <tr className="text-left uppercase tracking-wider text-zinc-500">
                      <th className="p-2">Time</th><th className="p-2">Class</th><th className="p-2">Conf</th>
                      <th className="p-2">Severity</th><th className="p-2">BBox</th><th className="p-2">Thumb</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archive.length === 0 && (
                      <tr><td colSpan={6} className="p-6 text-center text-zinc-600">No archived logs yet — run inspection to persist detections.</td></tr>
                    )}
                    {archive.map((r) => (
                      <tr key={r.id} className="border-t border-white/5 text-zinc-300">
                        <td className="p-2">{new Date(r.timestamp).toLocaleString()}</td>
                        <td className="p-2 font-bold text-white">{r.class}</td>
                        <td className="p-2 text-cyan-300">{(r.confidence * 100).toFixed(1)}%</td>
                        <td className="p-2">{r.severity}</td>
                        <td className="p-2 text-zinc-500">[{r.bbox.map((v) => Math.round(v)).join(", ")}]</td>
                        <td className="p-2">
                          {r.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`${API_URL}${r.thumbnail}`} alt="defect" className="h-10 w-14 rounded border border-white/10 object-cover" />
                          ) : <span className="text-zinc-700">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <AnalyticsCharts />
          </motion.div>
        )}
      </main>

      <AlertModal alert={alert} onClose={() => setAlert(null)} />
    </div>
  );
}
