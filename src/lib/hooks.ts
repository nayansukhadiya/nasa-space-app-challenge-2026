"use client";

import { useEffect, useMemo, useState } from "react";
import { moonStateAt } from "@/astro/cache";
import { type SiteTelemetry, siteTelemetry } from "@/astro/visibility";
import { useSim } from "@/store/sim";
import { type SiteEntry, useWorld } from "@/store/world";

/**
 * The simulation clock for React panels, throttled while playing. The 3D scene
 * reads the store directly each frame; panels only need ~8 Hz.
 */
export function useThrottledT(intervalMs = 120): number {
  const [t, setT] = useState(() => useSim.getState().tMs);
  useEffect(() => {
    let last = 0;
    return useSim.subscribe((s) => {
      const now = performance.now();
      if (!s.playing || now - last >= intervalMs) {
        last = now;
        setT(s.tMs);
      }
    });
  }, [intervalMs]);
  return t;
}

export function useSelectedEntry(): SiteEntry | null {
  const id = useSim((s) => s.selectedSiteId);
  const sites = useWorld((s) => s.sites);
  return id ? (sites[id] ?? null) : null;
}

export function useTelemetry(entry: SiteEntry | null, tMs: number): SiteTelemetry | null {
  return useMemo(
    () => (entry ? siteTelemetry(moonStateAt(tMs), entry.site, entry.mask) : null),
    [entry, tMs],
  );
}
