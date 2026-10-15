import { MOON_RADIUS_KM, RAD } from "@/astro/constants";
import { localBasis } from "@/astro/site";
import { type Vec3, scale } from "@/astro/vec";

/**
 * Moon-fixed (X→0°E, Y→90°E, Z→north) → three.js scene (Y up, 1 unit = 1 km).
 *
 *   scene = (Yf, −Zf − R, −Xf)
 *
 * The south pole sits at the origin with local "up" = +Y. Looking straight down
 * from +Y with the camera on the +Z side, the 0° meridian points up the screen
 * and 90°E points right: the same orientation as the 2D polar map.
 */
export const toScene = (v: Vec3): Vec3 => [v[1], -v[2] - MOON_RADIUS_KM, -v[0]];

/** A direction (no origin shift): Moon-fixed → scene axes. */
export const dirToScene = (v: Vec3): Vec3 => [v[1], -v[2], -v[0]];

/** Surface point (scene coordinates) at lat/lon, height `hKm`, optional vertical exaggeration. */
export function surfacePoint(latDeg: number, lonDeg: number, hKm = 0, k = 1): Vec3 {
  return toScene(scale(localBasis(latDeg, lonDeg).up, MOON_RADIUS_KM + hKm * k));
}

/** Inverse of `toScene` for a surface point: scene coordinates → selenographic [lat°, lon°E]. */
export function sceneToLatLon(x: number, y: number, z: number): [number, number] {
  const xf = -z;
  const yf = x;
  const zf = -y - MOON_RADIUS_KM;
  const r = Math.hypot(xf, yf, zf);
  return [Math.asin(zf / r) * RAD, Math.atan2(yf, xf) * RAD];
}
