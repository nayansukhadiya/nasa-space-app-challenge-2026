const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 2026-11-14 00:00:00Z */
export function fmtUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())}Z`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const fmtDeg = (v: number, digits = 2): string => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(digits)}°`;

export const fmtLat = (v: number): string => `${Math.abs(v).toFixed(2)}°${v < 0 ? "S" : "N"}`;
export const fmtLon = (v: number): string => `${Math.abs(v).toFixed(2)}°${v < 0 ? "W" : "E"}`;

export function fmtDuration(hours: number): string {
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  return `${hours.toFixed(1)} h`;
}

export const fmtTimeOfDay = (ms: number): string => fmtUtc(ms).slice(11, 16);

export function fmtMinutes(min: number): string {
  if (min >= 120) return `${(min / 60).toFixed(1)} h`;
  return `${Math.round(min)} min`;
}
