import { DEG, RAD } from "@/astro/constants";
import { HORIZON_SAMPLES, type HorizonMask } from "@/astro/horizon";
import { localBasis } from "@/astro/site";
import type { HeightSource } from "./heightmap";

export interface HorizonOptions {
  /** Antenna / eye height above the local surface, km. Default 0. */
  observerHeightKm?: number;
  /** Stop marching this far from the site, km. Default: as far as the map allows. */
  maxRangeKm?: number;
  /** Fixed march step, km. Default: the finest pixel size, growing with distance (0.15 % of range). */
  stepKm?: number;
}

/**
 * COMPUTED from MEASURED terrain: for each whole degree of azimuth, the highest
 * elevation angle at which the DEM blocks the sky, seen from `latDeg, lonDeg`.
 *
 * Rays follow great circles on the reference sphere; every sample's true 3-D
 * position (R + h) is compared to the site's local horizontal plane, so lunar
 * curvature is included. Marching stops where the ray leaves the map, so sites
 * near the map edge get a conservative (possibly low) mask on that side.
 */
export function computeHorizon(
  map: HeightSource,
  latDeg: number,
  lonDeg: number,
  opts: HorizonOptions = {},
): HorizonMask {
  const R = map.radiusKm;
  const maxRange = opts.maxRangeKm ?? map.halfKm * 1.5;
  const h0 = map.heightAtLatLon(latDeg, lonDeg);
  if (Number.isNaN(h0)) throw new Error("site is outside the heightmap");
  const r0 = R + h0 + (opts.observerHeightKm ?? 0);

  const phi1 = latDeg * DEG;
  const lam1 = lonDeg * DEG;
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const { up } = localBasis(latDeg, lonDeg);
  const p0x = up[0] * r0;
  const p0y = up[1] * r0;
  const p0z = up[2] * r0;

  const mask = new Float32Array(HORIZON_SAMPLES);
  for (let az = 0; az < HORIZON_SAMPLES; az++) {
    const theta = az * DEG;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    let best = -Infinity;
    let step = opts.stepKm ?? map.pixelKm;
    for (let d = step; d <= maxRange; d += step) {
      if (opts.stepKm === undefined) step = Math.max(map.pixelKm, d * 0.0015);
      const delta = d / R;
      const sinD = Math.sin(delta);
      const cosD = Math.cos(delta);
      const sinPhi2 = sinPhi1 * cosD + cosPhi1 * sinD * cosT;
      const phi2 = Math.asin(sinPhi2);
      const lam2 = lam1 + Math.atan2(sinT * sinD * cosPhi1, cosD - sinPhi1 * sinPhi2);
      const h = map.heightAtLatLon(phi2 * RAD, lam2 * RAD);
      if (Number.isNaN(h)) break;
      const r = R + h;
      const cp = Math.cos(phi2);
      const px = cp * Math.cos(lam2) * r - p0x;
      const py = cp * Math.sin(lam2) * r - p0y;
      const pz = sinPhi2 * r - p0z;
      const range = Math.hypot(px, py, pz);
      const el = Math.asin((px * up[0] + py * up[1] + pz * up[2]) / range);
      if (el > best) best = el;
    }
    // Nothing sampled (site on the map edge): report the flat-sphere horizon.
    mask[az] = best === -Infinity ? 0 : best * RAD;
  }
  return mask;
}
