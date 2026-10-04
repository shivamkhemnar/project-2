"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchStats } from "@/lib/api";
import { Activity, Boxes, Gauge, ShieldCheck } from "lucide-react";

const PIE_COLORS = ["#ef4444", "#f59e0b", "#22d3ee", "#10b981", "#a78bfa", "#64748b"];

interface Stats {
  hourly: { hour: string; defects: number }[];
  categories: { name: string; value: number }[];
  by_severity: Record<string, number>;
  total_24h: number;
  efficiency: number;
  latency: { inference_ms: number[]; render_ms: number[] };
  fps_history: number[];
  backend: string;
}

const card = "rounded-xl border border-white/10 bg-industrial-900/80 p-4";

function darkTooltipStyle() {
  return {
    backgroundColor: "#10151d",
    border: "1px solid rgba(34,211,238,0.25)",
    borderRadius: 10,
    fontSize: 12,
    color: "#e5e7eb",
  };
}

export function AnalyticsCharts() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await fetchStats();
        if (alive) {
          setStats(s);
          setError(null);
        }
      } catch (e: any) {
        if (alive) setError(e?.message || "stats unavailable");
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error && !stats) {
    return <div className={`${card} font-mono text-xs text-red-300`}>Telemetry unavailable: {error} — is the backend running on :8000?</div>;
  }
  if (!stats) {
    return <div className={`${card} animate-pulse font-mono text-xs text-zinc-500`}>Loading telemetry…</div>;
  }

  const latencyRows = stats.latency.inference_ms.map((v, i) => ({
    i,
    inference: v,
    render: stats.latency.render_ms[i] ?? 2.5,
  }));

  const kpis = [
    { icon: Boxes, label: "DEFECTS / 24H", value: stats.total_24h, color: "#f59e0b" },
    { icon: ShieldCheck, label: "LINE EFFICIENCY", value: `${stats.efficiency}%`, color: "#10b981" },
    { icon: Gauge, label: "AVG FPS", value: stats.fps_history.length ? (stats.fps_history.reduce((a, b) => a + b, 0) / stats.fps_history.length).toFixed(1) : "—", color: "#22d3ee" },
    { icon: Activity, label: "AVG INFER MS", value: stats.latency.inference_ms.length ? (stats.latency.inference_ms.reduce((a, b) => a + b, 0) / stats.latency.inference_ms.length).toFixed(1) : "—", color: "#a78bfa" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={card}>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <k.icon className="h-3.5 w-3.5" style={{ color: k.color }} /> {k.label}
            </div>
            <div className="mt-1 text-2xl font-black tabular-nums" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className={`${card} lg:col-span-3`}>
          <h3 className="mb-1 text-sm font-bold text-white">Hourly Defect Rate</h3>
          <p className="mb-3 font-mono text-[11px] text-zinc-500">detections logged per hour · last 12h · backend: {stats.backend}</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="hour" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 11 }} />
                <Tooltip contentStyle={darkTooltipStyle()} />
                <Line type="monotone" dataKey="defects" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={`${card} lg:col-span-2`}>
          <h3 className="mb-1 text-sm font-bold text-white">Defect Category Breakdown</h3>
          <p className="mb-3 font-mono text-[11px] text-zinc-500">last 24h · donut by class</p>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.categories} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                  {stats.categories.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={darkTooltipStyle()} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="mb-1 text-sm font-bold text-white">System Latency — Inference vs Render</h3>
        <p className="mb-3 font-mono text-[11px] text-zinc-500">last 30 streamed frames · milliseconds</p>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="i" tick={false} label={{ value: "frame (recency →)", fill: "#71717a", fontSize: 11, position: "insideBottom" }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
              <Tooltip contentStyle={darkTooltipStyle()} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="inference" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="render" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
