import { moonState } from "./frames";
import type { HorizonMask } from "./horizon";
import type { Site } from "./site";
import { dsnStatus, earthStatus, sunStatus } from "./visibility";

export interface SweepSite {
  site: Site;
  mask: HorizonMask;
}

type Windows = Array<[number, number]>;

export interface SweepResult {
  siteId: string;
  samples: number;
  /** Fraction of time with any part of the Sun above the horizon (0–1). Event edges are root-refined. */
  litFraction: number;
  /** Fraction of time with Earth's centre above the horizon (0–1). Edges are root-refined. */
  earthVisibleFraction: number;
  /**
   * Time-averaged light, 0–1: mean of the limb-darkened, eclipse-aware Sun fraction (feature 8: the plan's
   * "illumination %"). Lower than `litFraction` because a sliver of Sun counts for a sliver of power.
   */
  illumination: number;
  /** Contiguous intervals, epoch-ms [start, end), where the Sun is up. */
  litWindows: Windows;
  earthWindows: Windows;
  /** Longest continuous darkness within the span, hours. */
  longestDarkHours: number;
  /** Time the Earth hides > 1 % of the Sun's disc (lunar eclipses seen from the site), hours. */
  eclipseHours: number;
  eclipseWindows: Windows;
  /** Fraction of time at least one DSN station is mutually visible with the site (0–1). */
  dsnFraction: number;
  dsnWindows: Windows;
  /** Longest continuous time with NO DSN station able to talk to the site, hours. */
  longestDsnBlackoutHours: number;
  /** Longest continuous time Earth's centre is below the horizon, hours. */
  longestEarthBlackoutHours: number;
}

/**
 * Intervals where `margin > 0`, with each edge placed by linear interpolation of the margin across the step it
 * crosses (peer-review gap 9 / feature 29): t = t₍k−1₎ + Δt · g₍k−1₎ / (g₍k−1₎ − g₍k₎). That puts a sunrise within
 * seconds of the truth even on an hourly grid.
 */
function marginWindows(margin: Float32Array, t0: number, stepMs: number): Windows {
  const out: Windows = [];
  const n = margin.length;
  let start = Number.NaN;
  const cross = (k: number) => t0 + (k - 1) * stepMs + (stepMs * margin[k - 1]) / (margin[k - 1] - margin[k]);
  for (let k = 0; k < n; k++) {
    const up = margin[k] > 0;
    if (up && Number.isNaN(start)) start = k === 0 ? t0 : cross(k);
    if (!up && !Number.isNaN(start)) {
      out.push([start, cross(k)]);
      start = Number.NaN;
    }
  }
  if (!Number.isNaN(start)) out.push([start, t0 + n * stepMs]);
  return out;
}

function flagWindows(flags: Uint8Array, t0: number, stepMs: number): Windows {
  const out: Windows = [];
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

const totalMs = (w: Windows): number => w.reduce((s, [a, b]) => s + (b - a), 0);

/** Longest gap between windows (including the span's ends), ms. */
function longestGapMs(w: Windows, startMs: number, endMs: number): number {
  let longest = 0;
  let prevEnd = startMs;
  for (const [a, b] of w) {
    longest = Math.max(longest, a - prevEnd);
    prevEnd = b;
  }
  return Math.max(longest, endMs - prevEnd);
}

/**
 * COMPUTED: sample every site every `stepMs` between [startMs, endMs). The Moon state (the expensive part) is
 * computed once per step and shared by all sites. Rise/set times are refined between samples by interpolating
 * the horizon margin, so a coarse step still gives minute-level event times.
 */
export function sweep(
  sites: SweepSite[],
  startMs: number,
  endMs: number,
  stepMs: number,
  onProgress?: (fraction: number) => void,
): SweepResult[] {
  const n = Math.max(1, Math.floor((endMs - startMs) / stepMs));
  const spanEnd = startMs + n * stepMs;
  const sunMargin = sites.map(() => new Float32Array(n));
  const earthMargin = sites.map(() => new Float32Array(n));
  const fraction = sites.map(() => new Float32Array(n));
  const eclipse = sites.map(() => new Uint8Array(n));
  const dsn = sites.map(() => new Uint8Array(n));

  for (let i = 0; i < n; i++) {
    const state = moonState(new Date(startMs + i * stepMs));
    for (let s = 0; s < sites.length; s++) {
      const { site, mask } = sites[s];
      const sun = sunStatus(state, site, mask);
      const earth = earthStatus(state, site, mask);
      sunMargin[s][i] = sun.elDeg + sun.semiDiameterDeg - sun.horizonDeg;
      earthMargin[s][i] = earth.elDeg - earth.horizonDeg;
      fraction[s][i] = sun.fraction;
      eclipse[s][i] = sun.eclipseCover > 0.01 ? 1 : 0;
      dsn[s][i] = dsnStatus(state, site, mask).linked ? 1 : 0;
    }
    if (onProgress && i % 64 === 0) onProgress(i / n);
  }
  onProgress?.(1);

  return sites.map(({ site }, s) => {
    const litWindows = marginWindows(sunMargin[s], startMs, stepMs);
    const earthWindows = marginWindows(earthMargin[s], startMs, stepMs);
    const eclipseWindows = flagWindows(eclipse[s], startMs, stepMs);
    const dsnWindows = flagWindows(dsn[s], startMs, stepMs);
    let sumFraction = 0;
    for (let i = 0; i < n; i++) sumFraction += fraction[s][i];
    const span = n * stepMs;
    return {
      siteId: site.id,
      samples: n,
      litFraction: totalMs(litWindows) / span,
      earthVisibleFraction: totalMs(earthWindows) / span,
      illumination: sumFraction / n,
      litWindows,
      earthWindows,
      longestDarkHours: longestGapMs(litWindows, startMs, spanEnd) / 3_600_000,
      eclipseHours: totalMs(eclipseWindows) / 3_600_000,
      eclipseWindows,
      dsnFraction: totalMs(dsnWindows) / span,
      dsnWindows,
      longestDsnBlackoutHours: longestGapMs(dsnWindows, startMs, spanEnd) / 3_600_000,
      longestEarthBlackoutHours: longestGapMs(earthWindows, startMs, spanEnd) / 3_600_000,
    };
  });
}
