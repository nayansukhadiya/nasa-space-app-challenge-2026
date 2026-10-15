"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { moonStateAt } from "@/astro/cache";
import { earthStatus, sunStatus } from "@/astro/visibility";
import { fmtDate } from "@/lib/format";
import type { SiteEntry } from "@/store/world";

const DAY = 86_400_000;
const SPAN_DAYS = 15;
const STEP_MS = 3 * 3_600_000;

export type ChartKind = "sun" | "earth";

/**
 * Clearance above the terrain horizon (degrees) for ±15 days around `tMs`.
 * Above zero = the Sun (upper limb) or Earth (centre) is visible from the site.
 * The series is rebuilt only when the 6-hour bucket of `tMs` changes.
 */
export function TimelineChart({ entry, tMs, kind }: { entry: SiteEntry; tMs: number; kind: ChartKind }) {
  const bucket = Math.floor(tMs / (6 * 3_600_000));
  const data = useMemo(() => {
    const centre = bucket * 6 * 3_600_000;
    const out: Array<{ t: number; v: number }> = [];
    for (let t = centre - SPAN_DAYS * DAY; t <= centre + SPAN_DAYS * DAY; t += STEP_MS) {
      const st = moonStateAt(t);
      const v =
        kind === "sun"
          ? (() => {
              const s = sunStatus(st, entry.site, entry.mask);
              return s.elDeg + s.semiDiameterDeg - s.horizonDeg;
            })()
          : (() => {
              const e = earthStatus(st, entry.site, entry.mask);
              return e.elDeg - e.horizonDeg;
            })();
      out.push({ t, v: Number(v.toFixed(3)) });
    }
    return out;
  }, [bucket, entry, kind]);

  return (
    <div className="sw-chart" aria-label={kind === "sun" ? "Sun clearance over time" : "Earth clearance over time"}>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(238,244,243,0.08)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => fmtDate(v).slice(5)}
            tick={{ fill: "#a2b3b0", fontSize: 10 }}
            stroke="rgba(238,244,243,0.2)"
            tickCount={4}
          />
          <YAxis tick={{ fill: "#a2b3b0", fontSize: 10 }} stroke="rgba(238,244,243,0.2)" width={48} unit="°" />
          <ReferenceLine y={0} stroke="rgba(238,244,243,0.35)" strokeDasharray="3 3" />
          <ReferenceLine x={tMs} stroke="#2fdccf" />
          <Line type="monotone" dataKey="v" stroke="#eef4f3" strokeWidth={1.25} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
