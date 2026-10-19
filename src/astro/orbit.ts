import * as Astro from "astronomy-engine";
import { DEG } from "./constants";
import { eqjToMoonFixed } from "./frames";
import { GM_EARTH, GM_MOON, GM_SUN, type GravityField, acceleration } from "./gravity";
import { type RelayOrbit, solveKepler } from "./relay";
import { type Mat3, type Vec3, add, cross, mulMM, mulMV, rotX, rotZ, scale, sub, transpose } from "./vec";

/** Inertial (EQJ, Moon-centred) state: position km, velocity km/s. */
export interface OrbitState {
  r: Vec3;
  v: Vec3;
}

export interface Forces {
  /** Lunar gravity field (point mass, degree-2, or the full GRAIL field). */
  field: GravityField;
  /** Earth as a third body. Dominant perturbation on high and elliptical orbits. */
  earth: boolean;
  sun: boolean;
}

/** Moon-centred EQJ positions of the Earth and Sun at one instant (cached on the last query). */
let bodyCache: { tMs: number; earth: Vec3; sun: Vec3 } | null = null;
function bodiesAt(tMs: number): { earth: Vec3; sun: Vec3 } {
  if (bodyCache && bodyCache.tMs === tMs) return bodyCache;
  const d = new Date(tMs);
  const moon = Astro.GeoVector(Astro.Body.Moon, d, false);
  const sun = Astro.GeoVector(Astro.Body.Sun, d, false);
  const m: Vec3 = [moon.x * Astro.KM_PER_AU, moon.y * Astro.KM_PER_AU, moon.z * Astro.KM_PER_AU];
  const s: Vec3 = [sun.x * Astro.KM_PER_AU, sun.y * Astro.KM_PER_AU, sun.z * Astro.KM_PER_AU];
  bodyCache = { tMs, earth: scale(m, -1), sun: sub(s, m) };
  return bodyCache;
}

/** Third-body acceleration on a satellite at r about the Moon: GM·[(b − r)/|b − r|³ − b/|b|³] (direct − indirect). */
function thirdBody(gm: number, b: Vec3, r: Vec3): Vec3 {
  const d = sub(b, r);
  const dn = Math.hypot(d[0], d[1], d[2]);
  const bn = Math.hypot(b[0], b[1], b[2]);
  const k1 = gm / (dn * dn * dn);
  const k2 = gm / (bn * bn * bn);
  return [d[0] * k1 - b[0] * k2, d[1] * k1 - b[1] * k2, d[2] * k1 - b[2] * k2];
}

/** Total acceleration, km/s², on a satellite at EQJ position r and time tMs. */
export function accelerationEqj(f: Forces, tMs: number, r: Vec3): Vec3 {
  const q = eqjToMoonFixed(new Date(tMs));
  const rf = mulMV(q, r);
  // gravity is evaluated in the Moon-fixed frame (the field rotates with the Moon), then rotated back
  const af = acceleration(f.field, rf[0], rf[1], rf[2]);
  let a = mulMV(transpose(q), af);
  if (f.earth || f.sun) {
    const { earth, sun } = bodiesAt(tMs);
    if (f.earth) a = add(a, thirdBody(GM_EARTH, earth, r));
    if (f.sun) a = add(a, thirdBody(GM_SUN, sun, r));
  }
  return a;
}

/** One classical RK4 step of `dtS` seconds. */
function rk4(f: Forces, tMs: number, s: OrbitState, dtS: number): OrbitState {
  const half = dtS / 2;
  const deriv = (t: number, st: OrbitState): OrbitState => ({ r: st.v, v: accelerationEqj(f, t, st.r) });
  const k1 = deriv(tMs, s);
  const k2 = deriv(tMs + half * 1000, { r: add(s.r, scale(k1.r, half)), v: add(s.v, scale(k1.v, half)) });
  const k3 = deriv(tMs + half * 1000, { r: add(s.r, scale(k2.r, half)), v: add(s.v, scale(k2.v, half)) });
  const k4 = deriv(tMs + dtS * 1000, { r: add(s.r, scale(k3.r, dtS)), v: add(s.v, scale(k3.v, dtS)) });
  const combine = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 => [
    (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6,
    (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6,
    (a[2] + 2 * b[2] + 2 * c[2] + d[2]) / 6,
  ];
  return {
    r: add(s.r, scale(combine(k1.r, k2.r, k3.r, k4.r), dtS)),
    v: add(s.v, scale(combine(k1.v, k2.v, k3.v, k4.v), dtS)),
  };
}

/** Pole-aligned inertial → EQJ rotation at an instant: Pᵀ with P = R1(90° − δ)·R3(90° + α) (the IAU lunar pole). */
export function poleInertialToEqj(tMs: number): Mat3 {
  const axis = Astro.RotationAxis(Astro.Body.Moon, new Date(tMs));
  const p = mulMM(rotX(Math.PI / 2 - axis.dec * DEG), rotZ(Math.PI / 2 + axis.ra * 15 * DEG));
  return transpose(p);
}

/**
 * EQJ state of a Keplerian relay orbit at `tMs` (the same elements relay.ts propagates analytically), so the
 * analytic and numerical orbits start identical and any later difference is physics, not setup.
 */
export function keplerToStateEqj(o: RelayOrbit, tMs = o.epochMs): OrbitState {
  const mu = GM_MOON;
  const n = Math.sqrt(mu / o.aKm ** 3);
  const M = o.m0Deg * DEG + n * ((tMs - o.epochMs) / 1000);
  const E = solveKepler(M, o.e);
  const sqrt1me2 = Math.sqrt(1 - o.e * o.e);
  const rPeri: Vec3 = [o.aKm * (Math.cos(E) - o.e), o.aKm * sqrt1me2 * Math.sin(E), 0];
  const rn = o.aKm * (1 - o.e * Math.cos(E));
  const k = Math.sqrt(mu * o.aKm) / rn;
  const vPeri: Vec3 = [-k * Math.sin(E), k * sqrt1me2 * Math.cos(E), 0];
  const chain = (v: Vec3): Vec3 =>
    mulMV(rotZ(-o.raanDeg * DEG), mulMV(rotX(-o.incDeg * DEG), mulMV(rotZ(-o.argPerDeg * DEG), v)));
  const toEqj = poleInertialToEqj(tMs);
  return { r: mulMV(toEqj, chain(rPeri)), v: mulMV(toEqj, chain(vPeri)) };
}

/** A sampled numerical orbit with cubic-Hermite interpolation between samples. */
export interface Trajectory {
  t0Ms: number;
  stepS: number;
  n: number;
  /** EQJ positions and velocities, 3 per sample. */
  r: Float64Array;
  v: Float64Array;
  forces: Forces;
}

/** Integrate from `start` at `t0Ms` for `spanS` seconds, sampling every `stepS` (the RK4 step too). */
export function propagate(start: OrbitState, t0Ms: number, spanS: number, stepS: number, forces: Forces): Trajectory {
  const n = Math.floor(spanS / stepS) + 1;
  const r = new Float64Array(3 * n);
  const v = new Float64Array(3 * n);
  let s = start;
  for (let i = 0; i < n; i++) {
    r.set(s.r, 3 * i);
    v.set(s.v, 3 * i);
    if (i < n - 1) s = rk4(forces, t0Ms + i * stepS * 1000, s, stepS);
  }
  return { t0Ms, stepS, n, r, v, forces };
}

/** EQJ state at any instant inside the trajectory (cubic Hermite). Clamps outside the sampled span. */
export function stateAt(tr: Trajectory, tMs: number): OrbitState {
  const x = Math.min(tr.n - 1 - 1e-9, Math.max(0, (tMs - tr.t0Ms) / 1000 / tr.stepS));
  const i = Math.floor(x);
  const u = x - i;
  const h = tr.stepS;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const d00 = (6 * u ** 2 - 6 * u) / h;
  const d10 = 3 * u ** 2 - 4 * u + 1;
  const d01 = (-6 * u ** 2 + 6 * u) / h;
  const d11 = 3 * u ** 2 - 2 * u;
  const r: [number, number, number] = [0, 0, 0];
  const v: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const p0 = tr.r[3 * i + k];
    const p1 = tr.r[3 * (i + 1) + k];
    const v0 = tr.v[3 * i + k];
    const v1 = tr.v[3 * (i + 1) + k];
    r[k] = h00 * p0 + h10 * h * v0 + h01 * p1 + h11 * h * v1;
    v[k] = d00 * p0 + d10 * v0 + d01 * p1 + d11 * v1;
  }
  return { r, v };
}

/** Position in the Moon-fixed frame (what horizon masks use), km. */
export function positionFixed(tr: Trajectory, tMs: number): Vec3 {
  return mulMV(eqjToMoonFixed(new Date(tMs)), stateAt(tr, tMs).r);
}

/** Specific orbital energy, km²/s²: v²/2 − GM/r (point-mass part only; a drift check for the integrator). */
export const specificEnergy = (s: OrbitState): number =>
  (s.v[0] ** 2 + s.v[1] ** 2 + s.v[2] ** 2) / 2 - GM_MOON / Math.hypot(...s.r);

/** Specific angular momentum vector, km²/s. */
export const angularMomentum = (s: OrbitState): Vec3 => cross(s.r, s.v);
