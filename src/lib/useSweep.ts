"use client";

import { useEffect, useState } from "react";
import type { SweepResult } from "@/astro/sweep";
import type { SiteEntry } from "@/store/world";
import { terrainWorker } from "@/workers/client";

export type SweepState =
  | { status: "idle" | "running" }
  | { status: "done"; result: SweepResult }
  | { status: "error"; message: string };

type Settled = { key: string; result?: SweepResult; error?: string };

/**
 * COMPUTED in a Web Worker: illumination / Earth-visibility over [startMs, endMs)
 * for one site, hourly steps. Status is derived from whether the last settled
 * result matches the current request, so no state is set synchronously in the effect.
 */
export function useSweep(entry: SiteEntry | null, startMs: number, endMs: number): SweepState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = entry ? `${entry.site.id}|${entry.site.latDeg}|${entry.site.lonDeg}|${entry.masked}|${startMs}|${endMs}` : "";

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [result] = await terrainWorker().sweep([{ site: entry.site, mask: entry.mask }], startMs, endMs, 3_600_000);
        if (!cancelled) setSettled({ key, result });
      } catch (e) {
        if (!cancelled) setSettled({ key, error: e instanceof Error ? e.message : String(e) });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` encodes every input that matters; `entry` itself is a fresh object per world update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!entry) return { status: "idle" };
  if (!settled || settled.key !== key) return { status: "running" };
  if (settled.error) return { status: "error", message: settled.error };
  return { status: "done", result: settled.result as SweepResult };
}
