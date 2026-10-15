import * as Astro from "astronomy-engine";
import { eqjToMoonFixed } from "@/astro/frames";
import { ICRS_TO_GALACTIC } from "@/astro/sky";
import { type Mat3, mulMM, rotZ } from "@/astro/vec";

/** scene = Ms · moonFixed  (see scene/frame.ts: scene = (Yf, −Zf, −Xf) for directions). */
const MS: Mat3 = [
  [0, 1, 0],
  [0, 0, -1],
  [-1, 0, 0],
];
const MS_T: Mat3 = [
  [0, 0, -1],
  [1, 0, 0],
  [0, -1, 0],
];

const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

/**
 * Rotation taking a direction in scene axes to galactic Cartesian axes at a given instant:
 *   galactic = G · Qᵀ · Msᵀ · scene,  with Q = EQJ→Moon-fixed (IAU) and G = ICRS→galactic.
 * Used by the sky shader so every star sits where it really is relative to the Moon.
 */
export function sceneToGalactic(time: Date): Mat3 {
  const q = eqjToMoonFixed(time);
  return mulMM(ICRS_TO_GALACTIC, mulMM(transpose(q), MS_T));
}

/**
 * Earth-fixed axes (X→(0°N,0°E), Y→90°E, Z→north) → scene axes at a given instant:
 *   scene = Ms · Q · Rz_active(GAST) , so the meridian at longitude 0° points along RA = GAST.
 * Uses the J2000 equator as Earth's equator (the precession offset since J2000 is ~0.35°, invisible at this scale).
 */
export function earthToScene(time: Date): Mat3 {
  const q = eqjToMoonFixed(time);
  const gastRad = (Astro.SiderealTime(time) * 15 * Math.PI) / 180; // hours → degrees → radians
  return mulMM(MS, mulMM(q, rotZ(-gastRad)));
}

export { MS };
