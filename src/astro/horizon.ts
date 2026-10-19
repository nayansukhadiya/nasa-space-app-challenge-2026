/**
 * Horizon mask: terrain elevation angle (degrees above the local horizontal) for evenly spaced azimuths,
 * 0° = north, clockwise. 1,440 samples = 0.25° spacing: finer than the Sun's 0.53° disc, so short glints through
 * a notch in a ridge are not skipped (peer-review gap 2). Any length works for lookup, so older 360-sample
 * masks (and test fixtures) still interpolate correctly.
 */
export type HorizonMask = Float32Array;

export const HORIZON_SAMPLES = 1440;
export const HORIZON_STEP_DEG = 360 / HORIZON_SAMPLES;

/** Flat horizon (no terrain blocking). */
export const flatHorizon = (): HorizonMask => new Float32Array(HORIZON_SAMPLES);

/** Linearly interpolated mask elevation at any azimuth. */
export function horizonElevationDeg(mask: HorizonMask, azDeg: number): number {
  const n = mask.length;
  const x = ((((azDeg % 360) + 360) % 360) / 360) * n;
  const i = Math.floor(x);
  const f = x - i;
  return mask[i % n] * (1 - f) + mask[(i + 1) % n] * f;
}

/**
 * Fraction of the sky above the horizon, weighted by solid angle: V = (1/2π)∮(1 − sin θh) dA.
 * 1 on a flat plain, 0.5 in a hole whose rim is straight overhead. Used for the terrain-shielded radiation dose.
 */
export function skyViewFactor(mask: HorizonMask): number {
  let sum = 0;
  for (let i = 0; i < mask.length; i++) sum += 1 - Math.sin((Math.max(mask[i], 0) * Math.PI) / 180);
  return sum / mask.length;
}
