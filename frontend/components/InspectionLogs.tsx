"use client";
import { motion, AnimatePresence } from "framer-motion";
import { SEVERITY_COLOR, type Detection } from "@/lib/types";

export function InspectionLogs({ log }: { log: (Detection & { timestamp: string; frame_index: number })[] }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-industrial-900/80">
      <div className="border-b border-white/5 px-4 py-2.5 text-xs font-mono uppercase tracking-widest text-zinc-400">
        Inspection Log <span className="text-cyan-300">· {log.length}</span>
      </div>
      <div className="max-h-[560px] flex-1 space-y-1.5 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {log.length === 0 && <p className="p-6 text-center font-mono text-xs text-zinc-600">No defects yet — line is clean ✓</p>}
          {log.map((d, i) => (
            <motion.div key={`${d.frame_index}-${i}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2">
              <span className="h-8 w-1 rounded-full" style={{ background: SEVERITY_COLOR[d.severity] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="truncate">{d.class}</span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">{(d.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="font-mono text-[10px] text-zinc-500">f{d.frame_index} · {new Date(d.timestamp).toLocaleTimeString()} · [{d.bbox.join(",")}]</div>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{ background: `${SEVERITY_COLOR[d.severity]}22`, color: SEVERITY_COLOR[d.severity] }}>{d.severity}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
