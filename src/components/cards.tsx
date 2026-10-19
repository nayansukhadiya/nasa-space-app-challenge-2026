"use client";

import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { type Provenance, Tag } from "./ui";

/** A small (i) that explains a number in plain words on hover or keyboard focus. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="sw2-info" tabIndex={0} role="note" aria-label={text}>
      <Info size={13} aria-hidden />
      <span className="sw2-tip">{text}</span>
    </span>
  );
}

/**
 * One reading, one card: an icon that says what it is, the value, a provenance tag, a plain-language (i), and an
 * optional mini graphic on the right. Accent colour is reserved for state (`status`).
 */
export function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  tag,
  info,
  note,
  viz,
  status,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  /** Smaller text beside the value, e.g. "(1,280 ms)". */
  sub?: string;
  tag?: Provenance;
  info?: string;
  note?: ReactNode;
  viz?: ReactNode;
  status?: boolean;
}) {
  return (
    <div className="sw2-card">
      <div className={`sw2-card-icon ${status ? "on" : ""}`} aria-hidden>
        {icon}
      </div>
      <div className="sw2-card-main">
        <div className="sw2-card-top">
          <span className="sw2-card-label">{label}</span>
          {info && <InfoTip text={info} />}
        </div>
        <div className="sw2-card-value">
          <b className={status ? "sw-status" : ""}>{value}</b>
          {unit && <span>{unit}</span>}
          {sub && <em>{sub}</em>}
        </div>
        {(note || tag) && (
          <div className="sw2-card-note">
            {tag && <Tag kind={tag} />} {note}
          </div>
        )}
      </div>
      {viz && <div className="sw2-card-viz">{viz}</div>}
    </div>
  );
}

/** Tiny line chart with an optional second (dashed) series and a marker at `markAt` (0–1 along x). */
export function Spark({
  values,
  dashed,
  markAt,
  width = 84,
  height = 40,
}: {
  values: ArrayLike<number>;
  dashed?: ArrayLike<number>;
  markAt?: number;
  width?: number;
  height?: number;
}) {
  const n = values.length;
  if (n < 2) return null;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, values[i], dashed ? dashed[i] : Infinity);
    hi = Math.max(hi, values[i], dashed ? dashed[i] : -Infinity);
  }
  const pad = Math.max(0.5, (hi - lo) * 0.1);
  lo -= pad;
  hi += pad;
  const y = (v: number) => height - 3 - ((v - lo) / (hi - lo)) * (height - 6);
  const path = (a: ArrayLike<number>) => {
    let d = "";
    for (let i = 0; i < n; i++) d += `${i ? "L" : "M"}${((i / (n - 1)) * width).toFixed(1)},${y(a[i]).toFixed(1)}`;
    return d;
  };
  const mx = markAt === undefined ? null : markAt * width;
  const mi = markAt === undefined ? 0 : Math.min(n - 1, Math.round(markAt * (n - 1)));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 3" />
      {dashed && <path d={path(dashed)} fill="none" stroke="rgba(238,244,243,0.45)" strokeWidth={1} strokeDasharray="3 3" />}
      <path d={path(values)} fill="none" stroke="#eef4f3" strokeWidth={1.5} />
      {mx !== null && <circle cx={mx} cy={y(values[mi])} r={3} fill="#000" stroke="var(--accent)" strokeWidth={1.5} />}
    </svg>
  );
}

/** A thin horizontal bar for a 0–1 fraction, with an optional marker (e.g. a P10–P90 band end). */
export function Meter({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="sw2-meter" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={v} aria-label={label}>
      <i style={{ width: `${v * 100}%` }} />
    </div>
  );
}
