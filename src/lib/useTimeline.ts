"use client";

import { useMemo } from "react";
import { type NextSunEvent, type TimelineData, computeTimeline, nextSunEvent } from "@/astro/timeline";
import type { HorizonMask } from "@/astro/horizon";
import type { SiteEntry } from "@/store/world";

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Sample spacing for a given window, keeping every chart under ~360 points. */
export function stepForSpan(spanMs: number): number {
  if (spanMs <= 1.1 * DAY) return 10 * 60_000;
  if (spanMs <= 4 * DAY) return 20 * 60_000;
  if (spanMs <= 15 * DAY) return HOUR;
  return 6 * HOUR;
}

/**
 * The window the timeline draws. It is anchored on a grid of span/6 so it only recomputes when the clock crosses a
 * grid line (not every frame while playing), placing "now" between 35 % and 52 % of the way across.
 */
export function timelineStart(tMs: number, spanMs: number): number {
  const q = spanMs / 6;
  return Math.floor((tMs - 0.35 * spanMs) / q) * q;
}

export function useTimeline(
  entry: SiteEntry | null,
  linkMask: HorizonMask | null,
  tMs: number,
  spanMs: number,
  /** While dragging, keep the window where it was so the marker follows the cursor instead of the grid. */
  frozenStartMs: number | null = null,
): TimelineData | null {
  const start = frozenStartMs ?? timelineStart(tMs, spanMs);
  const key = entry ? `${entry.site.id}|${entry.site.latDeg}|${entry.site.lonDeg}` : "";
  return useMemo(
    () => (entry && linkMask ? computeTimeline(entry.site, entry.mask, linkMask, start, spanMs, stepForSpan(spanMs)) : null),
    // `key` stands in for the site; the masks are stable objects per site
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, entry?.mask, linkMask, start, spanMs],
  );
}

/** Next sunrise (or sunset, if lit) within 30 days of `tMs`, recomputed each simulated hour (6 h grid, refined). */
export function useNextSun(entry: SiteEntry | null, tMs: number): NextSunEvent | null {
  const bucket = Math.floor(tMs / HOUR);
  const key = entry ? `${entry.site.id}|${entry.site.latDeg}|${entry.site.lonDeg}` : "";
  return useMemo(
    () => (entry ? nextSunEvent(entry.site, entry.mask, bucket * HOUR, 30, 6 * HOUR) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, entry?.mask, bucket],
  );
}
