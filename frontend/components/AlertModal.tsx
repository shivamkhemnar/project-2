"use client";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import type { Detection } from "@/lib/types";

export function AlertModal({ alert, onClose }: { alert: Detection | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {alert && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            className="glow-critical w-full max-w-md rounded-2xl border border-red-500/50 bg-industrial-900 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/15 p-3"><AlertTriangle className="h-6 w-6 text-red-400" /></div>
                <div>
                  <h2 className="text-lg font-bold text-red-300">CRITICAL DEFECT</h2>
                  <p className="font-mono text-xs text-zinc-400">confidence ≥ 85% · line action required</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 rounded-xl bg-black/40 p-4 font-mono text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">CLASS</span><span className="font-bold text-white">{alert.class}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-zinc-500">CONFIDENCE</span><span className="font-bold text-red-300">{(alert.confidence * 100).toFixed(1)}%</span></div>
              <div className="mt-1 flex justify-between"><span className="text-zinc-500">BBOX</span><span className="text-zinc-300">[{alert.bbox.join(", ")}]</span></div>
            </div>
            <button onClick={onClose} className="mt-4 w-full rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-400">
              ACKNOWLEDGE & RESUME LINE
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
