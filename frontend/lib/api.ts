export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/inspect";

export async function fetchLogs(params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${API_URL}/api/logs?${q.toString()}`);
  if (!r.ok) throw new Error("logs fetch failed");
  return r.json();
}

export async function fetchStats() {
  const r = await fetch(`${API_URL}/api/stats`);
  if (!r.ok) throw new Error("stats fetch failed");
  return r.json();
}

export async function uploadFile(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_URL}/api/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error("upload failed");
  return r.json();
}

export function clsx(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}
