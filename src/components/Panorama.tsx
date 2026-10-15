"use client";

import { useMemo } from "react";
import { moonStateAt } from "@/astro/cache";
import { horizonElevationDeg } from "@/astro/horizon";
import { type RelayOrbit, relayPositionFixed } from "@/astro/relay";
import { lookAngles } from "@/astro/site";
import type { SiteEntry } from "@/store/world";

const W = 340;
const H = 150;
const PAD_L = 30;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 18;
const HOUR = 3_600_000;

type Pt = { az: number; el: number };

/** Split a track into polylines wherever the azimuth wraps through north. */
function segments(pts: Pt[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    const last = cur[cur.length - 1];
    if (last && Math.abs(p.az - last.az) > 180) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Panoramic view from the site: 360° of azimuth across, elevation up. The filled silhouette is the
 * terrain horizon mask; lines are the Sun and Earth over the next lunar day (and, optionally, a relay
 * over the next 24 h). At the pole everything hugs the horizon, so a panorama reads far better than a
 * zenith-centred sky plot.
 */
export function Panorama({
  entry,
  tMs,
  relay,
}: {
  entry: SiteEntry;
  tMs: number;
  relay?: RelayOrbit | null;
}) {
  const bucket = Math.floor(tMs / (6 * HOUR));

  const tracks = useMemo(() => {
    const t0 = bucket * 6 * HOUR;
    const sun: Pt[] = [];
    const earth: Pt[] = [];
    for (let i = 0; i <= 118; i++) {
      const st = moonStateAt(t0 + i * 6 * HOUR);
      const s = lookAngles(st.sunKm, entry.site);
      const e = lookAngles(st.earthKm, entry.site);
      sun.push({ az: s.azDeg, el: s.elDeg });
      earth.push({ az: e.azDeg, el: e.elDeg });
    }
    const rel: Pt[] = [];
    if (relay) {
      for (let i = 0; i <= 288; i++) {
        const p = lookAngles(relayPositionFixed(relay, t0 + i * 300_000), entry.site);
        rel.push({ az: p.azDeg, el: p.elDeg });
      }
    }
    return { sun, earth, rel };
  }, [bucket, entry.site, relay]);

  const now = useMemo(() => {
    const st = moonStateAt(tMs);
    return {
      sun: lookAngles(st.sunKm, entry.site),
      earth: lookAngles(st.earthKm, entry.site),
      rel: relay ? lookAngles(relayPositionFixed(relay, tMs), entry.site) : null,
    };
  }, [tMs, entry.site, relay]);

  let maxH = 0;
  for (const v of entry.mask) maxH = Math.max(maxH, v);
  const elMin = -4;
  const elMax = Math.max(10, Math.ceil(maxH + 3));

  const x = (az: number) => PAD_L + (az / 360) * (W - PAD_L - PAD_R);
  const y = (el: number) => PAD_T + ((elMax - el) / (elMax - elMin)) * (H - PAD_T - PAD_B);
  const line = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.az).toFixed(1)},${y(p.el).toFixed(1)}`).join("");

  let sil = `M${x(0)},${y(horizonElevationDeg(entry.mask, 0))}`;
  for (let az = 1; az <= 360; az++) sil += `L${x(az).toFixed(1)},${y(horizonElevationDeg(entry.mask, az)).toFixed(1)}`;
  sil += `L${x(360)},${H - PAD_B}L${x(0)},${H - PAD_B}Z`;

  const ticks = [0, 5, 10, 15, 20, 30].filter((t) => t >= elMin && t <= elMax);

  return (
    <div>
      <svg className="sw-sky" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Panorama of the terrain horizon with Sun and Earth tracks">
        <defs>
          <clipPath id="sw-pano-clip">
            <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="rgba(238,244,243,0.12)" />
            <text x={PAD_L - 4} y={y(t) + 3} textAnchor="end" fontSize="8" fill="#a2b3b0" fontFamily="var(--font-data)">
              {t}°
            </text>
          </g>
        ))}
        {[0, 90, 180, 270, 360].map((a) => (
          <g key={a}>
            <line x1={x(a)} x2={x(a)} y1={PAD_T} y2={H - PAD_B} stroke="rgba(238,244,243,0.08)" />
            <text x={x(a)} y={H - 5} textAnchor="middle" fontSize="8" fill="#a2b3b0" fontFamily="var(--font-data)">
              {{ 0: "N", 90: "E", 180: "S", 270: "W", 360: "N" }[a]}
            </text>
          </g>
        ))}
        <g clipPath="url(#sw-pano-clip)">
          <path d={sil} fill="rgba(238,244,243,0.16)" stroke="#eef4f3" strokeWidth="0.8" />
          {segments(tracks.earth).map((s, i) => (
            <path key={`e${i}`} d={line(s)} fill="none" stroke="#eef4f3" strokeWidth="0.9" strokeDasharray="3 3" />
          ))}
          {segments(tracks.sun).map((s, i) => (
            <path key={`s${i}`} d={line(s)} fill="none" stroke="#2fdccf" strokeWidth="1" />
          ))}
          {relay &&
            segments(tracks.rel).map((s, i) => (
              <path key={`r${i}`} d={line(s)} fill="none" stroke="#eef4f3" strokeWidth="1.4" strokeDasharray="1 3" />
            ))}
          <circle cx={x(now.sun.azDeg)} cy={y(now.sun.elDeg)} r="3.6" fill="#2fdccf" />
          <circle cx={x(now.earth.azDeg)} cy={y(now.earth.elDeg)} r="3.6" fill="#000" stroke="#eef4f3" />
          {now.rel && <rect x={x(now.rel.azDeg) - 3} y={y(now.rel.elDeg) - 3} width="6" height="6" fill="#eef4f3" />}
        </g>
      </svg>
      <div className="sw-legend">
        <span>
          <i className="acc" />
          SUN, 30 D
        </span>
        <span>
          <i className="dash" />
          EARTH, 30 D
        </span>
        {relay && (
          <span>
            <i className="dash" />
            RELAY, 24 H
          </span>
        )}
        <span>▮ TERRAIN HORIZON</span>
      </div>
    </div>
  );
}
