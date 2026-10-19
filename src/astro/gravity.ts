import { DEG, MOON_RADIUS_KM } from "./constants";
import { type Vec3 } from "./vec";

/**
 * Lunar gravitational parameter, km³/s² (JPL DE430/DE440 value; GRAIL GRGM1200A agrees to ~1e-7). The same value
 * the relay module uses for two-body motion.
 */
export const GM_MOON = 4902.800066;

/** Moon's sidereal rotation rate, rad/s (27.321661 d; synchronous with its orbit). */
export const OMEGA_MOON = (2 * Math.PI) / (27.321661 * 86_400);

/** Earth and Sun gravitational parameters, km³/s² (DE440), used as third-body perturbers. */
export const GM_EARTH = 398_600.435507;
export const GM_SUN = 132_712_440_041.279;

/**
 * A spherical-harmonic gravity field, fully-normalised (the convention GRAIL's SHADR products use):
 *   U(r,φ,λ) = (GM/r) · Σₙ (a/r)ⁿ Σₘ P̄ₙₘ(sin φ) · [C̄ₙₘ cos mλ + S̄ₙₘ sin mλ]
 * with `a` the field's reference radius. Coefficients are stored triangularly: index n(n+1)/2 + m.
 */
export interface GravityField {
  name: string;
  /** Provenance, shown wherever a number from this field is shown. */
  source: string;
  gm: number;
  rRefKm: number;
  nMax: number;
  c: Float64Array;
  s: Float64Array;
}

const idx = (n: number, m: number): number => (n * (n + 1)) / 2 + m;

/** Build a field from sparse {n, m, C, S} rows (everything unspecified is zero; C̄00 = 1). */
export function makeField(
  name: string,
  source: string,
  gm: number,
  rRefKm: number,
  terms: Array<{ n: number; m: number; c: number; s?: number }>,
): GravityField {
  const nMax = Math.max(...terms.map((t) => t.n), 0);
  const size = idx(nMax, nMax) + 1;
  const c = new Float64Array(size);
  const s = new Float64Array(size);
  c[0] = 1;
  for (const t of terms) {
    c[idx(t.n, t.m)] = t.c;
    s[idx(t.n, t.m)] = t.s ?? 0;
  }
  return { name, source, gm, rRefKm, nMax, c, s };
}

/**
 * Degree-2 truncation of the GRAIL field, shipped so the model works with no download: the Moon's flattening
 * (C̄20 = −9.088e-5, i.e. J2 ≈ 2.032e-4) and its equatorial ellipticity (C̄22 = 3.4675e-5, unnormalised C22 ≈
 * 2.238e-5), reference radius 1738 km. Values are rounded to the precision I trust from memory; replace with the
 * full GRGM field via `parseGravityJson` once the SHADR file has been converted (pipeline/gravity.py).
 * It captures the two largest non-spherical terms, NOT the mascons: those live in degrees 6–100.
 */
export const DEGREE2_FIELD: GravityField = makeField(
  "Degree-2 truncation (J2, C22)",
  "GRAIL-derived low-degree terms, rounded; full field not yet loaded",
  GM_MOON,
  1738.0,
  [
    { n: 2, m: 0, c: -9.088e-5 },
    { n: 2, m: 2, c: 3.4675e-5 },
  ],
);

/** Point-mass field (the two-body assumption the Kepler orbits make). */
export const POINT_MASS_FIELD: GravityField = makeField("Point mass", "two-body", GM_MOON, 1738.0, []);

/** Parse the compact JSON the pipeline writes: {gm, rRefKm, nMax, name, source, c:[…], s:[…]} (triangular order). */
export function parseGravityJson(j: {
  name: string;
  source: string;
  gm: number;
  rRefKm: number;
  nMax: number;
  c: number[];
  s: number[];
}): GravityField {
  const size = idx(j.nMax, j.nMax) + 1;
  if (j.c.length !== size || j.s.length !== size) throw new Error("gravity field: coefficient count mismatch");
  return { ...j, c: Float64Array.from(j.c), s: Float64Array.from(j.s) };
}

export async function loadGravityField(url = "/data/gravity.json"): Promise<GravityField | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return parseGravityJson(await res.json());
  } catch {
    return null;
  }
}

/**
 * Gravitational potential U (km²/s², positive), at a Moon-fixed position (km) from the Moon's centre of mass.
 * Fully-normalised associated Legendre functions by the standard forward-column recursion (stable to degree ~150).
 */
export function potential(f: GravityField, x: number, y: number, z: number): number {
  const r = Math.hypot(x, y, z);
  const sinPhi = z / r;
  const cosPhi = Math.hypot(x, y) / r;
  const lam = Math.atan2(y, x);
  const N = f.nMax;

  // P̄[n][m] for this latitude, stored triangularly
  const P = new Float64Array(idx(N, N) + 1);
  P[0] = 1;
  if (N >= 1) {
    P[idx(1, 1)] = Math.sqrt(3) * cosPhi;
    P[idx(1, 0)] = Math.sqrt(3) * sinPhi;
  }
  for (let n = 2; n <= N; n++) {
    P[idx(n, n)] = Math.sqrt((2 * n + 1) / (2 * n)) * cosPhi * P[idx(n - 1, n - 1)];
    P[idx(n, n - 1)] = Math.sqrt(2 * n + 1) * sinPhi * P[idx(n - 1, n - 1)];
    for (let m = 0; m <= n - 2; m++) {
      const a = Math.sqrt(((2 * n - 1) * (2 * n + 1)) / ((n - m) * (n + m)));
      const b = Math.sqrt(((2 * n + 1) * (n + m - 1) * (n - m - 1)) / ((n - m) * (n + m) * (2 * n - 3)));
      P[idx(n, m)] = a * sinPhi * P[idx(n - 1, m)] - b * P[idx(n - 2, m)];
    }
  }

  const cosM = new Float64Array(N + 1);
  const sinM = new Float64Array(N + 1);
  for (let m = 0; m <= N; m++) {
    cosM[m] = Math.cos(m * lam);
    sinM[m] = Math.sin(m * lam);
  }

  let sum = 0;
  let ar = 1; // (a/r)^n
  const q = f.rRefKm / r;
  for (let n = 0; n <= N; n++) {
    let inner = 0;
    for (let m = 0; m <= n; m++) {
      const k = idx(n, m);
      inner += P[k] * (f.c[k] * cosM[m] + f.s[k] * sinM[m]);
    }
    sum += ar * inner;
    ar *= q;
  }
  return (f.gm / r) * sum;
}

/**
 * Gravitational acceleration a = ∇U (km/s²) at a Moon-fixed position (km), by a central difference of the
 * potential. The step (1 m) keeps truncation error ~1e-13 relative and round-off ~1e-10 relative to g, far below
 * the field's own uncertainty.
 */
export function acceleration(f: GravityField, x: number, y: number, z: number): Vec3 {
  const h = 1e-3;
  return [
    (potential(f, x + h, y, z) - potential(f, x - h, y, z)) / (2 * h),
    (potential(f, x, y + h, z) - potential(f, x, y - h, z)) / (2 * h),
    (potential(f, x, y, z + h) - potential(f, x, y, z - h)) / (2 * h),
  ];
}

export interface SurfaceGravity {
  /** Effective gravity magnitude at the site (gravitation + centrifugal), m/s². */
  gMs2: number;
  /** Gravitation alone, m/s². */
  gravitationMs2: number;
  /** Centrifugal part along the local vertical (reduces weight), m/s². */
  centrifugalMs2: number;
  /** Radius from the centre of mass used, km. */
  radiusKm: number;
  /** Escape speed from that radius, km/s. */
  escapeKmS: number;
  /** Circular-orbit speed at that radius, km/s. */
  circularKmS: number;
}

/**
 * COMPUTED: gravity at a lunar site. `heightKm` is the DEM elevation above the 1737.4 km reference sphere
 * (LOLA radii are measured from the centre of mass, so r = 1737.4 + h). Centrifugal acceleration of the Moon's
 * slow spin (ω² r cos φ ≈ 1.2e-5 m/s² at the equator) is included for completeness.
 */
export function surfaceGravity(f: GravityField, latDeg: number, lonDeg: number, heightKm = 0): SurfaceGravity {
  const r = MOON_RADIUS_KM + heightKm;
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  const x = r * Math.cos(phi) * Math.cos(lam);
  const y = r * Math.cos(phi) * Math.sin(lam);
  const z = r * Math.sin(phi);
  const g = acceleration(f, x, y, z);
  const w2 = OMEGA_MOON * OMEGA_MOON;
  const eff: Vec3 = [g[0] + w2 * x, g[1] + w2 * y, g[2]];
  const up: Vec3 = [x / r, y / r, z / r];
  // spin outward-radial component of the centrifugal term: ω²·(x·û_x + y·û_y)
  const centrifugal = w2 * (x * up[0] + y * up[1]);
  return {
    gMs2: Math.hypot(eff[0], eff[1], eff[2]) * 1000,
    gravitationMs2: Math.hypot(g[0], g[1], g[2]) * 1000,
    centrifugalMs2: centrifugal * 1000,
    radiusKm: r,
    escapeKmS: Math.sqrt((2 * f.gm) / r),
    circularKmS: Math.sqrt(f.gm / r),
  };
}

/** Time to fall `heightM` from rest in uniform gravity g, seconds: t = √(2h/g). */
export const freeFallS = (heightM: number, gMs2: number): number => Math.sqrt((2 * heightM) / gMs2);

/** Hang time of a jump leaving the ground at `v0` m/s: t = 2·v₀/g, seconds. */
export const hangTimeS = (v0Ms: number, gMs2: number): number => (2 * v0Ms) / gMs2;

/** Distance to the horizon from a mast of height h on a sphere of radius R: d = √(2Rh + h²), km. */
export const horizonDistanceKm = (heightKm: number, radiusKm = MOON_RADIUS_KM): number =>
  Math.sqrt(2 * radiusKm * heightKm + heightKm * heightKm);

/** Orbital period of a circular orbit at radius r (km), seconds. */
export const circularPeriodS = (rKm: number, gm = GM_MOON): number => 2 * Math.PI * Math.sqrt((rKm * rKm * rKm) / gm);
