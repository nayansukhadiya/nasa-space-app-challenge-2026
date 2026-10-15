import { moonState } from "./frames";
import type { HorizonMask } from "./horizon";
import type { Site } from "./site";
import { earthStatus, sunStatus } from "./visibility";

export interface SweepSite {
  site: Site;
  mask: HorizonMask;
}

export interface SweepResult {
  siteId: string;
  samples: number;
  /** Fraction of samples with any part of the Sun above the horizon (0–1). */
  litFraction: number;
  /** Fraction of samples with Earth's centre above the horizon (0–1). */
  earthVisibleFraction: number;
  /** Contiguous intervals, epoch-ms [start, end), where the Sun is up. */
  litWindows: Array<[number, number]>;
  earthWindows: Array<[number, number]>;
  /** Longest continuous darkness within the span, hours. */
  longestDarkHours: number;
}

function windows(flags: Uint8Array, t0: number, stepMs: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && start < 0) start = i;
    if (!flags[i] && start >= 0) {
      out.push([t0 + start * stepMs, t0 + i * stepMs]);
      start = -1;
    }
  }
  if (start >= 0) out.push([t0 + start * stepMs, t0 + flags.length * stepMs]);
  return out;
}

/**
 * COMPUTED: sample every site every `stepMs` between [startMs, endMs). The Moon
 * state (the expensive part) is computed once per step and shared by all sites.
 */
export function sweep(
  sites: SweepSite[],
  startMs: number,
  endMs: number,
  stepMs: number,
  onProgress?: (fraction: number) => void,
): SweepResult[] {
  const n = Math.max(1, Math.floor((endMs - startMs) / stepMs));
  const lit = sites.map(() => new Uint8Array(n));
  const earth = sites.map(() => new Uint8Array(n));

  for (let i = 0; i < n; i++) {
    const state = moonState(new Date(startMs + i * stepMs));
    for (let s = 0; s < sites.length; s++) {
      const { site, mask } = sites[s];
      lit[s][i] = sunStatus(state, site, mask).lit ? 1 : 0;
      earth[s][i] = earthStatus(state, site, mask).visible ? 1 : 0;
    }
    if (onProgress && i % 64 === 0) onProgress(i / n);
  }
  onProgress?.(1);

  return sites.map(({ site }, s) => {
    const litWindows = windows(lit[s], startMs, stepMs);
    const earthWindows = windows(earth[s], startMs, stepMs);
    const sum = (a: Uint8Array) => a.reduce((x, y) => x + y, 0);
    let longestDark = 0;
    let prevEnd = startMs;
    for (const [a, b] of litWindows) {
      longestDark = Math.max(longestDark, a - prevEnd);
      prevEnd = b;
    }
    longestDark = Math.max(longestDark, startMs + n * stepMs - prevEnd);
    return {
      siteId: site.id,
      samples: n,
      litFraction: sum(lit[s]) / n,
      earthVisibleFraction: sum(earth[s]) / n,
      litWindows,
      earthWindows,
      longestDarkHours: longestDark / 3_600_000,
    };
  });
}
