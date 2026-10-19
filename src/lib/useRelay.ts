"use client";

import { useEffect, useState } from "react";
import { type RelayOrbit, type RelayWindows } from "@/astro/relay";
import type { GravityModel } from "@/workers/terrain.worker";
import type { SiteEntry } from "@/store/world";
import { terrainWorker } from "@/workers/client";

export type RelayState =
  | { status: "idle" | "running" }
  | { status: "done"; windows: RelayWindows; startMs: number; endMs: number; driftKm: number | null; field: string }
  | { status: "error"; message: string };

type Settled = { key: string; windows?: RelayWindows; startMs: number; endMs: number; driftKm: number | null; field: string; error?: string };

const HOUR = 3_600_000;

/**
 * MODELED relay pass windows for the next 48 h (re-run when the hour, site, orbit or gravity model changes).
 * "two-body" is the analytic Kepler orbit; the other models integrate the orbit under lunar gravity (and Earth/Sun).
 */
export function useRelayWindows(
  orbit: RelayOrbit | null,
  entry: SiteEntry | null,
  tMs: number,
  model: GravityModel = "two-body",
): RelayState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const startMs = Math.floor(tMs / HOUR) * HOUR;
  const endMs = startMs + 48 * HOUR;
  const key = orbit && entry ? `${orbit.id}|${entry.site.id}|${entry.site.latDeg}|${entry.site.lonDeg}|${entry.masked}|${startMs}|${model}` : "";

  useEffect(() => {
    if (!orbit || !entry) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (model === "two-body") {
          const windows = await terrainWorker().relay(orbit, entry.site, entry.mask, startMs, endMs, 60_000);
          if (!cancelled) setSettled({ key, windows, startMs, endMs, driftKm: null, field: "Point mass (two-body)" });
        } else {
          const r = await terrainWorker().relayNumeric(orbit, entry.site, entry.mask, startMs, endMs, 60_000, model);
          if (!cancelled) setSettled({ key, windows: r.windows, startMs, endMs, driftKm: r.driftKm, field: r.field });
        }
      } catch (e) {
        if (!cancelled) setSettled({ key, startMs, endMs, driftKm: null, field: "", error: e instanceof Error ? e.message : String(e) });
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` encodes every input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!orbit || !entry) return { status: "idle" };
  if (!settled || settled.key !== key) return { status: "running" };
  if (settled.error) return { status: "error", message: settled.error };
  return {
    status: "done",
    windows: settled.windows as RelayWindows,
    startMs: settled.startMs,
    endMs: settled.endMs,
    driftKm: settled.driftKm,
    field: settled.field,
  };
}
