"use client";

import { useMemo } from "react";
import { fmtDate, fmtUtc } from "@/lib/format";
import { useThrottledT } from "@/lib/hooks";
import { PLAY_SPEEDS, useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { Glass } from "./ui";

const DAY = 86_400_000;

/** Floating control bar: play, speed, UTC, date jump and the time slider with mission ticks. */
export function Scrubber() {
  const playing = useSim((s) => s.playing);
  const speedIdx = useSim((s) => s.speedIdx);
  const startMs = useSim((s) => s.windowStartMs);
  const endMs = useSim((s) => s.windowEndMs);
  const { setT, setPlaying, setSpeedIdx, setWindow, selectSite, selectMission } = useSim.getState();
  const tMs = useThrottledT(60);
  const missions = useWorld((s) => s.missions);

  const ticks = useMemo(
    () =>
      missions
        .filter((m) => m.dateUtc)
        .map((m) => ({ m, ms: Date.parse(m.dateUtc as string) }))
        .filter(({ ms }) => ms >= startMs && ms <= endMs),
    [missions, startMs, endMs],
  );

  const clamped = Math.min(Math.max(tMs, startMs), endMs);
  const pct = ((clamped - startMs) / (endMs - startMs)) * 100;

  const shift = (dir: -1 | 1) => {
    const span = endMs - startMs;
    setWindow(startMs + (dir * span) / 2, endMs + (dir * span) / 2);
  };

  const onDate = (v: string) => {
    if (!v) return;
    const day = Date.parse(`${v}T00:00:00Z`);
    if (Number.isNaN(day)) return;
    const timeOfDay = ((tMs % DAY) + DAY) % DAY;
    const next = day + timeOfDay;
    if (next < startMs || next > endMs) setWindow(next - 45 * DAY, next + 45 * DAY, next);
    else setT(next);
  };

  return (
    <Glass className="sw-bar" as="footer">
      <div className="sw-bar-row">
        <button type="button" className="sw-play" onClick={() => setPlaying(!playing)} aria-pressed={playing} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <select className="sw-select" value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))} aria-label="Playback speed">
          {PLAY_SPEEDS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="sw-utc">
          <span className="sw-utc-label">UTC</span>
          {fmtUtc(tMs)}
        </div>
        <input
          className="sw-date"
          type="date"
          value={fmtDate(tMs)}
          onChange={(e) => onDate(e.target.value)}
          aria-label="Jump to date (UTC)"
        />
        <div className="sw-spacer" />
        <button type="button" className="sw-mini-btn" onClick={() => shift(-1)} aria-label="Shift window earlier">
          ◀
        </button>
        <button type="button" className="sw-mini-btn" onClick={() => setWindow(tMs - 45 * DAY, tMs + 45 * DAY)}>
          Centre
        </button>
        <button type="button" className="sw-mini-btn" onClick={() => shift(1)} aria-label="Shift window later">
          ▶
        </button>
      </div>
      <div className="sw-track">
        <input
          type="range"
          min={startMs}
          max={endMs}
          step={600_000}
          value={clamped}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="Simulation time (UTC)"
          style={{ ["--pct" as string]: `${pct}%` }}
        />
        {ticks.map(({ m, ms }) => (
          <button
            key={m.id}
            type="button"
            className="sw-tick"
            style={{ left: `${((ms - startMs) / (endMs - startMs)) * 100}%` }}
            title={`${m.name} · ${fmtDate(ms)}`}
            onClick={() => {
              setT(ms);
              selectMission(m.id);
              if (m.lat !== null) selectSite(m.id);
            }}
          />
        ))}
      </div>
      <div className="sw-track-ends">
        <span>{fmtDate(startMs)}</span>
        <span>{fmtDate(endMs)}</span>
      </div>
    </Glass>
  );
}
