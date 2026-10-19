/** Linear-interpolated percentile (0–100) of a numeric sample: the "type 7" definition used by NumPy and Excel. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const v = [...values].sort((a, b) => a - b);
  const x = ((v.length - 1) * Math.min(100, Math.max(0, p))) / 100;
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < v.length ? v[i] * (1 - f) + v[i + 1] * f : v[i];
}

export interface Spread {
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  n: number;
}

/** Median and P10–P90 of a sample (peer-review gaps 6 and 23: a bounded, skewed quantity is not ±σ). */
export function spread(values: readonly number[]): Spread {
  return {
    p10: percentile(values, 10),
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    min: values.length ? Math.min(...values) : Number.NaN,
    max: values.length ? Math.max(...values) : Number.NaN,
    n: values.length,
  };
}

/**
 * Points of a regular grid inside a circle of `radiusKm` about a centre, as km offsets east/north (centre included).
 * Used to evaluate a landing REGION rather than a single point: nobody lands on a point (peer-review gap 6).
 */
export function diskGrid(radiusKm: number, spacingKm: number): Array<{ eastKm: number; northKm: number }> {
  const out: Array<{ eastKm: number; northKm: number }> = [{ eastKm: 0, northKm: 0 }];
  const k = Math.floor(radiusKm / spacingKm);
  for (let i = -k; i <= k; i++) {
    for (let j = -k; j <= k; j++) {
      if (i === 0 && j === 0) continue;
      const e = i * spacingKm;
      const n = j * spacingKm;
      if (Math.hypot(e, n) <= radiusKm + 1e-9) out.push({ eastKm: e, northKm: n });
    }
  }
  return out;
}

/** Offset a lat/lon by east/north kilometres on a sphere (great-circle step along the bearing). */
export function offsetLatLon(
  latDeg: number,
  lonDeg: number,
  eastKm: number,
  northKm: number,
  radiusKm = 1737.4,
): [number, number] {
  const d = Math.hypot(eastKm, northKm) / radiusKm;
  if (d === 0) return [latDeg, lonDeg];
  const bearing = Math.atan2(eastKm, northKm);
  const phi1 = (latDeg * Math.PI) / 180;
  const lam1 = (lonDeg * Math.PI) / 180;
  const sinPhi2 = Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(bearing);
  const phi2 = Math.asin(sinPhi2);
  const lam2 =
    lam1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(phi1), Math.cos(d) - Math.sin(phi1) * sinPhi2);
  return [(phi2 * 180) / Math.PI, (((lam2 * 180) / Math.PI + 540) % 360) - 180];
}
