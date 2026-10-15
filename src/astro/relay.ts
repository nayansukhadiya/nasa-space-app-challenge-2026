import * as Astro from "astronomy-engine";
import { DEG, MOON_RADIUS_KM } from "./constants";
import { moonState } from "./frames";
import type { HorizonMask } from "./horizon";
import { horizonElevationDeg } from "./horizon";
import { type Site, lookAngles } from "./site";
import { type Vec3, dot, mulMV, norm, rotX, rotZ, sub } from "./vec";

/** Lunar gravitational parameter, km³/s² (DE430 GM_Moon). */
export const MU_MOON = 4902.800066;

/**
 * Two-body Keplerian orbit about the Moon. MODELED: ignores lunar mascons, Earth/Sun third-body
 * perturbations and orbit-plane precession, so it is a *shape and timing* illustration, not a
 * navigation-grade ephemeris. Angles in degrees; `epochMs` is when the mean anomaly equals `m0Deg`.
 */
export interface RelayOrbit {
  id: string;
  name: string;
  note: string;
  aKm: number;
  e: number;
  incDeg: number;
  raanDeg: number;
  argPerDeg: number;
  m0Deg: number;
  epochMs: number;
}

/** Generic polar relay concepts for illustration. None of these is any real mission's orbit. */
export const RELAY_PRESETS: RelayOrbit[] = [
  {
    id: "polar-circular-500",
    name: "Polar circular · 500 km",
    note: "Low circular polar orbit, ~2.6 h period. Sees the pole every pass but only briefly.",
    aKm: MOON_RADIUS_KM + 500,
    e: 0,
    incDeg: 90,
    raanDeg: 0,
    argPerDeg: 0,
    m0Deg: 0,
    epochMs: Date.UTC(2026, 10, 14),
  },
  elliptical("polar-elliptical-12h", "Polar elliptical · 12 h", 12, 500),
  elliptical("polar-elliptical-24h", "Polar elliptical · 24 h", 24, 500),
];

/** Elliptical polar orbit with the given period (h) and periapsis altitude (km), apoapsis over the south pole. */
function elliptical(id: string, name: string, periodH: number, periAltKm: number): RelayOrbit {
  const T = periodH * 3600;
  const a = Math.cbrt((MU_MOON * T * T) / (4 * Math.PI * Math.PI));
  const rp = MOON_RADIUS_KM + periAltKm;
  return {
    id,
    name,
    note: `${periodH} h period, apoapsis over the south pole so it lingers there. Periapsis ${periAltKm} km.`,
    aKm: a,
    e: 1 - rp / a,
    incDeg: 90,
    raanDeg: 0,
    argPerDeg: 90, // periapsis at argument-of-latitude 90° (north) → apoapsis at 270° (south)
    m0Deg: 180, // start at apoapsis, i.e. over the south pole at the epoch
    epochMs: Date.UTC(2026, 10, 14),
  };
}

export const orbitPeriodS = (o: RelayOrbit): number => 2 * Math.PI * Math.sqrt(o.aKm ** 3 / MU_MOON);

/** Solve Kepler's equation M = E − e·sin E (Newton, converges for e < 1). */
export function solveKepler(M: number, e: number): number {
  const m = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 30; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/** Position in the pole-aligned inertial frame (z = lunar pole of date, x = equatorial node), km. */
export function inertialPosition(o: RelayOrbit, tMs: number): Vec3 {
  const n = Math.sqrt(MU_MOON / o.aKm ** 3);
  const M = o.m0Deg * DEG + n * ((tMs - o.epochMs) / 1000);
  const E = solveKepler(M, o.e);
  const xp = o.aKm * (Math.cos(E) - o.e);
  const yp = o.aKm * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  // perifocal → inertial: R3(−Ω)·R1(−i)·R3(−ω) applied as passive inverses
  let v = mulMV(rotZ(-o.argPerDeg * DEG), [xp, yp, 0]);
  v = mulMV(rotX(-o.incDeg * DEG), v);
  return mulMV(rotZ(-o.raanDeg * DEG), v);
}

/**
 * Position in the Moon-fixed frame, km. The pole-aligned inertial frame differs from the
 * Moon-fixed frame by the prime-meridian rotation alone: fixed = R3(W)·inertial.
 */
export function relayPositionFixed(o: RelayOrbit, tMs: number): Vec3 {
  const w = Astro.RotationAxis(Astro.Body.Moon, new Date(tMs)).spin * DEG;
  return mulMV(rotZ(w), inertialPosition(o, tMs));
}

/** Does the straight segment a→b pass through the Moon (sphere of radius R about the origin)? */
export function segmentHitsMoon(a: Vec3, b: Vec3, radiusKm = MOON_RADIUS_KM): boolean {
  const d = sub(b, a);
  const dd = dot(d, d);
  const t = Math.min(1, Math.max(0, -dot(a, d) / dd));
  const closest: Vec3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
  return norm(closest) < radiusKm;
}

export interface RelayLink {
  /** Satellite position, Moon-fixed, km. */
  posKm: Vec3;
  altitudeKm: number;
  /** Site → relay look angles and whether terrain lets the site see it. */
  elDeg: number;
  azDeg: number;
  rangeKm: number;
  siteSeesRelay: boolean;
  /** Relay → Earth line of sight (not blocked by the Moon). */
  relaySeesEarth: boolean;
  /** Both hops available: site → relay → Earth. */
  linked: boolean;
}

export function relayLink(
  o: RelayOrbit,
  site: Pick<Site, "latDeg" | "lonDeg" | "heightKm">,
  mask: HorizonMask,
  tMs: number,
  earthKm: Vec3,
): RelayLink {
  const posKm = relayPositionFixed(o, tMs);
  const look = lookAngles(posKm, site);
  const siteSeesRelay = look.elDeg > horizonElevationDeg(mask, look.azDeg);
  const relaySeesEarth = !segmentHitsMoon(posKm, earthKm);
  return {
    posKm,
    altitudeKm: norm(posKm) - MOON_RADIUS_KM,
    elDeg: look.elDeg,
    azDeg: look.azDeg,
    rangeKm: look.rangeKm,
    siteSeesRelay,
    relaySeesEarth,
    linked: siteSeesRelay && relaySeesEarth,
  };
}

export interface RelayWindows {
  siteSeesRelay: Array<[number, number]>;
  linked: Array<[number, number]>;
  /** Fraction of the span with a usable site→relay→Earth chain. */
  linkedFraction: number;
  /** Fraction of the span with Earth directly visible from the site. */
  directFraction: number;
  /** Fraction with either a direct link or a relayed one. */
  anyFraction: number;
  direct: Array<[number, number]>;
}

function toWindows(flags: Uint8Array, t0: number, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let s = -1;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && s < 0) s = i;
    if (!flags[i] && s >= 0) {
      out.push([t0 + s * step, t0 + i * step]);
      s = -1;
    }
  }
  if (s >= 0) out.push([t0 + s * step, t0 + flags.length * step]);
  return out;
}

/** COMPUTED on a MODELED orbit: pass windows over [startMs, endMs) sampled every stepMs. */
export function relayWindows(
  o: RelayOrbit,
  site: Site,
  mask: HorizonMask,
  startMs: number,
  endMs: number,
  stepMs = 60_000,
): RelayWindows {
  const n = Math.max(1, Math.floor((endMs - startMs) / stepMs));
  const see = new Uint8Array(n);
  const linked = new Uint8Array(n);
  const direct = new Uint8Array(n);
  const any = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = startMs + i * stepMs;
    const st = moonState(new Date(t));
    const link = relayLink(o, site, mask, t, st.earthKm);
    const e = lookAngles(st.earthKm, site);
    const dir = e.elDeg > horizonElevationDeg(mask, e.azDeg);
    see[i] = link.siteSeesRelay ? 1 : 0;
    linked[i] = link.linked ? 1 : 0;
    direct[i] = dir ? 1 : 0;
    any[i] = dir || link.linked ? 1 : 0;
  }
  const frac = (a: Uint8Array) => a.reduce((x, y) => x + y, 0) / n;
  return {
    siteSeesRelay: toWindows(see, startMs, stepMs),
    linked: toWindows(linked, startMs, stepMs),
    direct: toWindows(direct, startMs, stepMs),
    linkedFraction: frac(linked),
    directFraction: frac(direct),
    anyFraction: frac(any),
  };
}
