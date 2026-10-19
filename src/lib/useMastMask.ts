"use client";

import { useEffect, useState } from "react";
import type { HorizonMask } from "@/astro/horizon";
import type { SiteEntry } from "@/store/world";
import { terrainWorker } from "@/workers/client";

type Settled = { key: string; mask: HorizonMask };

/**
 * The terrain horizon as seen from the top of an antenna mast (peer-review gap 15). Raising the antenna lowers the
 * skyline in every direction, so a rim that blocks the Earth from the ground can clear it from 10 m up. The worker
 * marches the DEM again from `mastM` above the surface; results are debounced so dragging the slider is cheap, and
 * the ground-level mask is returned until the new one is ready (or whenever the mast is 0).
 */
export function useMastMask(entry: SiteEntry | null, mastM: number): { mask: HorizonMask | null; pending: boolean } {
  const [settled, setSettled] = useState<Settled | null>(null);
  const m = Math.round(mastM * 10) / 10;
  const key = entry && entry.masked && m > 0 ? `${entry.site.id}|${entry.site.latDeg}|${entry.site.lonDeg}|${m}` : "";

  useEffect(() => {
    if (!entry || !key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await terrainWorker().horizon(entry.site.latDeg, entry.site.lonDeg, m / 1000);
        if (!cancelled && res) setSettled({ key, mask: res.mask });
      } catch {
        // keep the ground-level mask: it is the conservative (higher) horizon
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` encodes every input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!entry) return { mask: null, pending: false };
  if (!key) return { mask: entry.mask, pending: false };
  if (settled && settled.key === key) return { mask: settled.mask, pending: false };
  return { mask: entry.mask, pending: true };
}
