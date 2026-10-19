import { moonState } from "./frames";
import type { HorizonMask } from "./horizon";
import type { Site } from "./site";
import { sweep } from "./sweep";
import { dsnStatus, earthStatus, sunStatus } from "./visibility";

/** Everything the bottom "Time & visibility" chart draws, sampled every `stepMs` over [t0Ms, t0Ms + n·stepMs). */
export interface TimelineData {
  t0Ms: number;
  stepMs: number;
  n: number;
  /** Sun elevation of the disc centre, degrees. */
  sunEl: Float32Array;
  /** Terrain horizon at the Sun's azimuth, degrees. The Sun is lit while its upper limb is above this line. */
  horizon: Float32Array;
  /** Light reaching the site, 0–1 (limb-darkened, eclipse-aware). */
  light: Float32Array;
  /** Share of the Sun hidden by the Earth, 0–1. */
  eclipse: Float32Array;
  /** At least one DSN station and the site can see each other (antenna mask). */
  dsn: Uint8Array;
  /** Earth's centre is above the antenna's horizon, whether or not a station is up. */
  earth: Uint8Array;
}

/**
 * COMPUTED: the series behind the timeline. `sunMask` is the skyline from panel height, `linkMask` the skyline from
 * the antenna mast (they differ once the mast is raised).
 */
export function computeTimeline(
  site: Site,
  sunMask: HorizonMask,
  linkMask: HorizonMask,
  t0Ms: number,
  spanMs: number,
  stepMs: number,
): TimelineData {
  const n = Math.max(2, Math.floor(spanMs / stepMs));
  const d: TimelineData = {
    t0Ms,
    stepMs,
    n,
    sunEl: new Float32Array(n),
    horizon: new Float32Array(n),
    light: new Float32Array(n),
    eclipse: new Float32Array(n),
    dsn: new Uint8Array(n),
    earth: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const st = moonState(new Date(t0Ms + i * stepMs));
    const sun = sunStatus(st, site, sunMask);
    d.sunEl[i] = sun.elDeg;
    d.horizon[i] = sun.horizonDeg;
    d.light[i] = sun.fraction;
    d.eclipse[i] = sun.eclipseCover;
    d.dsn[i] = dsnStatus(st, site, linkMask).linked ? 1 : 0;
    d.earth[i] = earthStatus(st, site, linkMask).visible ? 1 : 0;
  }
  return d;
}

export interface NextSunEvent {
  /** What happens next: the Sun rises over the skyline, or sets behind it. */
  kind: "sunrise" | "sunset";
  atMs: number;
}

/**
 * COMPUTED: the next sunrise (if dark now) or sunset (if lit now), searched up to `horizonDays` ahead on a 3-hour
 * grid and refined between samples. Null when nothing changes inside the search window (a long polar day or night).
 */
export function nextSunEvent(
  site: Site,
  mask: HorizonMask,
  fromMs: number,
  horizonDays = 60,
  stepMs = 3 * 3_600_000,
): NextSunEvent | null {
  const step = stepMs;
  const [r] = sweep([{ site, mask }], fromMs, fromMs + horizonDays * 86_400_000, step);
  const first = r.litWindows[0];
  if (!first) return null;
  if (first[0] <= fromMs + 1) return first[1] >= fromMs + horizonDays * 86_400_000 - 1 ? null : { kind: "sunset", atMs: first[1] };
  return { kind: "sunrise", atMs: first[0] };
}
