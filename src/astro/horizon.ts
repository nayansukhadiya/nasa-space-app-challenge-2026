/**
 * Horizon mask: terrain elevation angle (degrees above the local horizontal)
 * for each whole degree of azimuth, 0° = north, clockwise. 360 samples.
 */
export type HorizonMask = Float32Array;

export const HORIZON_SAMPLES = 360;

/** Flat horizon (no terrain blocking). */
export const flatHorizon = (): HorizonMask => new Float32Array(HORIZON_SAMPLES);

/** Linearly interpolated mask elevation at any azimuth. */
export function horizonElevationDeg(mask: HorizonMask, azDeg: number): number {
  const a = ((azDeg % 360) + 360) % 360;
  const i = Math.floor(a);
  const f = a - i;
  return mask[i] * (1 - f) + mask[(i + 1) % HORIZON_SAMPLES] * f;
}
