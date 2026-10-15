import type { Mat3, Vec3 } from "./vec";
import { dot } from "./vec";

/**
 * ICRS (J2000 equatorial) → Galactic rotation (Hipparcos catalogue definition, ESA SP-1200 vol. 1 §1.5.3).
 * Galactic centre ≈ RA 266.405°, Dec −28.936°.
 */
export const ICRS_TO_GALACTIC: Mat3 = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

/** Galactic longitude / latitude (degrees, l in [−180, 180]) of a direction given in galactic Cartesian axes. */
export function galacticLonLat(g: Vec3): [number, number] {
  const n = Math.hypot(g[0], g[1], g[2]);
  return [(Math.atan2(g[1], g[0]) * 180) / Math.PI, (Math.asin(g[2] / n) * 180) / Math.PI];
}

/** Unit vector for J2000 equatorial RA/Dec in degrees. */
export function eqjUnit(raDeg: number, decDeg: number): Vec3 {
  const a = (raDeg * Math.PI) / 180;
  const d = (decDeg * Math.PI) / 180;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export const mulRow = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
