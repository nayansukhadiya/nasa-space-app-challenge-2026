"use client";

import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause, Play, Sunrise, Sunset } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TimelineData } from "@/astro/timeline";
import { fmtDate, fmtUtc } from "@/lib/format";
import { useSelectedEntry, useThrottledT } from "@/lib/hooks";
import { useMastMask } from "@/lib/useMastMask";
import { stepForSpan, useNextSun, useTimeline } from "@/lib/useTimeline";
import { useLink } from "@/store/link";
import { PLAY_SPEEDS, useSim } from "@/store/sim";
import { Glass } from "../ui";

const DAY = 86_400_000;
const SPANS = [
  { label: "1 d", days: 1 },
  { label: "3 d", days: 3 },
  { label: "14 d", days: 14 },
  { label: "90 d", days: 90 },
] as const;

/** Colours of the bands, shared with the legend so the two can never disagree. */
const C = {
  lit: "#f1d48a",
  dark: "#26292d",
  eclipse: "#e0963a",
  link: "#e9f1f0",
  earthOnly: "#6c7376",
  grid: "rgba(255,255,255,0.08)",
  sun: "#eef4f3",
  horizon: "rgba(238,244,243,0.45)",
  now: "#2fdccf",
};

const BAND_H = 10;
const BAND_GAP = 3;
const CHART_H = 50;
const AXIS_H = 15;
const TOP_PAD = 4;
const H = TOP_PAD + CHART_H + 8 + 3 * (BAND_H + BAND_GAP) + AXIS_H;

/** "#rrggbb" blended toward another by f (0–1). */
function mix(a: string, b: string, f: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  const c = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * f);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

const fmtMonthDay = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-GB", { month: "short", day: "2-digit", timeZone: "UTC" });

function untilText(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} days`;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(200, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Chart({
  data,
  tMs,
  width,
  onScrub,
  onDragStart,
  onDragEnd,
}: {
  data: TimelineData;
  tMs: number;
  width: number;
  onScrub: (ms: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const span = data.n * data.stepMs;
  const x = (ms: number) => ((ms - data.t0Ms) / span) * width;
  const cell = width / data.n;

  const { path, hpath, yOf, ymin, ymax } = useMemo(() => {
    let lo = Math.min(0, ...data.sunEl, ...data.horizon);
    let hi = Math.max(0, ...data.sunEl, ...data.horizon);
    const pad = Math.max(1, (hi - lo) * 0.08);
    lo -= pad;
    hi += pad;
    if (hi - lo < 4) {
      lo -= (4 - (hi - lo)) / 2;
      hi += (4 - (hi - lo)) / 2;
    }
    const y = (v: number) => TOP_PAD + CHART_H - ((v - lo) / (hi - lo)) * CHART_H;
    const line = (a: Float32Array) => {
      let d = "";
      for (let i = 0; i < data.n; i++) d += `${i ? "L" : "M"}${(((i + 0.5) / data.n) * width).toFixed(1)},${y(a[i]).toFixed(1)}`;
      return d;
    };
    return { path: line(data.sunEl), hpath: line(data.horizon), yOf: y, ymin: lo, ymax: hi };
  }, [data, width]);

  // UTC midnights inside the window
  const days: number[] = [];
  for (let t = Math.ceil(data.t0Ms / DAY) * DAY; t < data.t0Ms + span; t += span > 20 * DAY ? 10 * DAY : DAY) days.push(t);

  const bandTop = (row: number) => TOP_PAD + CHART_H + 8 + row * (BAND_H + BAND_GAP);
  const nowX = x(tMs);
  const idxAt = (ms: number) => Math.min(data.n - 1, Math.max(0, Math.floor(((ms - data.t0Ms) / span) * data.n)));
  const iNow = idxAt(tMs);

  const toMs = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return data.t0Ms + f * span;
  };
  const hi = hover === null ? null : idxAt(hover);

  return (
    <svg
      className="sw2-time-svg"
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      role="slider"
      aria-label="Simulation time. Drag to scrub."
      aria-valuenow={tMs}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDragStart();
        onScrub(toMs(e));
      }}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      onPointerMove={(e) => {
        setHover(toMs(e));
        if (e.buttons === 1) onScrub(toMs(e));
      }}
      onPointerLeave={() => setHover(null)}
    >
      {days.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={TOP_PAD} y2={H - AXIS_H} stroke={C.grid} />
          <text x={x(t) + 3} y={H - 3} className="sw2-time-axis">
            {fmtMonthDay(t)}
          </text>
        </g>
      ))}

      {/* sun elevation vs terrain horizon: the Sun is lit while its line is above the dashed one */}
      <line x1={0} x2={width} y1={yOf(0)} y2={yOf(0)} stroke="rgba(255,255,255,0.18)" strokeDasharray="2 4" />
      <path d={hpath} fill="none" stroke={C.horizon} strokeWidth={1} strokeDasharray="3 3" />
      <path d={path} fill="none" stroke={C.sun} strokeWidth={1.6} />
      <text x={3} y={TOP_PAD + 9} className="sw2-time-axis">
        {ymax.toFixed(1)}°
      </text>
      <text x={3} y={TOP_PAD + CHART_H - 2} className="sw2-time-axis">
        {ymin.toFixed(1)}°
      </text>

      {[0, 1, 2].map((row) => (
        <g key={row} shapeRendering="crispEdges">
          {Array.from({ length: data.n }).map((_, i) => {
            const light = data.light[i];
            let fill: string = C.dark;
            let op = 1;
            if (row === 0) fill = light > 0.002 ? mix(C.dark, C.lit, Math.min(1, light * 1.1)) : C.dark;
            if (row === 1) fill = data.dsn[i] ? C.link : data.earth[i] ? C.earthOnly : C.dark;
            if (row === 2) {
              fill = data.eclipse[i] > 0.01 ? C.eclipse : C.dark;
              op = data.eclipse[i] > 0.01 ? 0.55 + 0.45 * data.eclipse[i] : 1;
            }
            return <rect key={i} x={i * cell} y={bandTop(row)} width={cell + 0.6} height={BAND_H} fill={fill} opacity={op} />;
          })}
        </g>
      ))}

      {hi !== null && hover !== null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={TOP_PAD} y2={H - AXIS_H} stroke="rgba(255,255,255,0.35)" />
          <text x={Math.min(width - 150, x(hover) + 6)} y={TOP_PAD + 22} className="sw2-time-hover">
            {fmtUtc(hover).slice(5, 16)} · {data.sunEl[hi].toFixed(2)}° · {data.dsn[hi] ? "link" : data.earth[hi] ? "no station" : "no Earth"}
          </text>
        </g>
      )}

      <g pointerEvents="none">
        <line x1={nowX} x2={nowX} y1={TOP_PAD} y2={H - AXIS_H} stroke={C.now} strokeWidth={1.2} />
        <circle cx={nowX} cy={yOf(data.sunEl[iNow])} r={4} fill="#000" stroke={C.now} strokeWidth={1.6} />
      </g>
    </svg>
  );
}

/** Bottom dock: transport, then the story of the next few days (Sun, light, Earth contact, eclipses) in one view. */
export function TimeVisibility() {
  const playing = useSim((s) => s.playing);
  const speedIdx = useSim((s) => s.speedIdx);
  const windowStartMs = useSim((s) => s.windowStartMs);
  const windowEndMs = useSim((s) => s.windowEndMs);
  const dockOpen = useSim((s) => s.dockOpen);
  const { setT, setPlaying, setSpeedIdx, setWindow, setDockOpen } = useSim.getState();
  const tMs = useThrottledT(80);
  const entry = useSelectedEntry();
  const mastM = useLink((s) => s.mastM);
  const { mask: linkMask } = useMastMask(entry, mastM);
  const [spanDays, setSpanDays] = useState<number>(3);
  const spanMs = spanDays * DAY;
  const [frozen, setFrozen] = useState<number | null>(null);
  const data = useTimeline(entry, linkMask, tMs, spanMs, frozen);
  const next = useNextSun(entry, tMs);
  // Lit right now? (upper limb of the Sun above the skyline in the chart sample nearest to now)
  const litNow = data
    ? (() => {
        const i = Math.min(data.n - 1, Math.max(0, Math.floor(((tMs - data.t0Ms) / (data.n * data.stepMs)) * data.n)));
        return data.sunEl[i] + 0.267 > data.horizon[i];
      })()
    : false;
  const [chartRef, width] = useWidth();

  const goTo = useCallback(
    (ms: number) => {
      const t = Math.round(ms / 300_000) * 300_000;
      setPlaying(false);
      if (t < windowStartMs || t > windowEndMs) setWindow(t - 45 * DAY, t + 45 * DAY, t);
      else setT(t);
    },
    [setPlaying, setT, setWindow, windowStartMs, windowEndMs],
  );

  const onDate = (v: string) => {
    const day = Date.parse(`${v}T00:00:00Z`);
    if (Number.isNaN(day)) return;
    goTo(day + (((tMs % DAY) + DAY) % DAY));
  };

  return (
    <Glass className={`sw2-time ${dockOpen ? "" : "min"}`} as="footer" aria-label="Time and visibility">
      <div className="sw2-time-head">
        <span className="sw2-title">Time &amp; visibility</span>
        <button
          type="button"
          className="sw2-play"
          onClick={() => setPlaying(!playing)}
          aria-pressed={playing}
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <select className="sw2-select" value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))} aria-label="Playback speed">
          {PLAY_SPEEDS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="sw2-datetime" title="Simulation time, UTC">
          {fmtUtc(tMs)}
        </div>
        <label className="sw2-iconbtn sw2-datepick" title="Jump to a date">
          <Calendar size={15} />
          <input type="date" value={fmtDate(tMs)} onChange={(e) => onDate(e.target.value)} aria-label="Jump to date (UTC)" />
        </label>
        <button type="button" className="sw2-iconbtn" onClick={() => goTo(tMs - DAY)} aria-label="Back one day" title="Back one day">
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="sw2-iconbtn" onClick={() => goTo(tMs + DAY)} aria-label="Forward one day" title="Forward one day">
          <ChevronRight size={15} />
        </button>
        <div className="sw2-spans" role="group" aria-label="Chart span">
          {SPANS.map((s) => (
            <button key={s.days} type="button" className={spanDays === s.days ? "on" : ""} onClick={() => setSpanDays(s.days)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="sw2-next" title="Next change in sunlight at this site (terrain included)">
          {(next ? next.kind === "sunrise" : !litNow) ? <Sunrise size={16} /> : <Sunset size={16} />}
          <div>
            <b>{next ? untilText(next.atMs - tMs) : "30+ days"}</b>
            <span>{next ? `Next ${next.kind}` : litNow ? "No sunset yet" : "No sunrise yet"}</span>
          </div>
        </div>
        <button
          type="button"
          className="sw2-iconbtn"
          onClick={() => setDockOpen(!dockOpen)}
          aria-expanded={dockOpen}
          aria-label={dockOpen ? "Collapse the chart" : "Expand the chart"}
          title={dockOpen ? "Collapse the chart" : "Expand the chart"}
        >
          {dockOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {dockOpen && (
      <div className="sw2-time-body">
        <div className="sw2-time-labels" style={{ height: H }}>
          <span style={{ top: TOP_PAD + 6 }}>Sun elevation</span>
          <span style={{ top: TOP_PAD + CHART_H + 8 }}>Illumination</span>
          <span style={{ top: TOP_PAD + CHART_H + 8 + (BAND_H + BAND_GAP) }}>Earth link</span>
          <span style={{ top: TOP_PAD + CHART_H + 8 + 2 * (BAND_H + BAND_GAP) }}>Lunar eclipse</span>
        </div>
        <div className="sw2-time-chart" ref={chartRef}>
          {data ? (
            <Chart
              data={data}
              tMs={tMs}
              width={width}
              onScrub={goTo}
              onDragStart={() => setFrozen(data.t0Ms)}
              onDragEnd={() => setFrozen(null)}
            />
          ) : (
            <p className="sw-note">Pick a site to see its day, light and Earth contact.</p>
          )}
        </div>
      </div>
      )}

      {dockOpen && (
      <div className="sw2-legend" aria-label="Legend">
        <span>
          <i style={{ background: C.lit }} />
          Sunlit
        </span>
        <span>
          <i style={{ background: C.eclipse }} />
          Eclipse (Earth&apos;s shadow)
        </span>
        <span>
          <i style={{ background: C.dark, outline: "1px solid rgba(255,255,255,0.2)" }} />
          Dark
        </span>
        <span>
          <i style={{ background: C.link }} />
          Station link (DSN)
        </span>
        <span>
          <i style={{ background: C.earthOnly }} />
          Earth up, no station
        </span>
        <span className="sw2-legend-dash">
          <i className="dash" />
          Terrain horizon
        </span>
        <span className="sw2-legend-step">{stepForSpan(spanMs) / 60_000 >= 60 ? `${stepForSpan(spanMs) / 3_600_000} h` : `${stepForSpan(spanMs) / 60_000} min`} steps · UTC</span>
      </div>
      )}
    </Glass>
  );
}

