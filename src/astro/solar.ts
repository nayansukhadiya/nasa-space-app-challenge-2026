
/** Total solar irradiance at 1 AU, W/m² (Kopp & Lean 2011 reference value, 1360.8). */
export const SOLAR_CONSTANT_W_M2 = 1360.8;
export const AU_KM = 149_597_870.7;

/**
 * Fraction (0–1) of the solar disc's AREA above a straight horizon.
 * `d` = (centre elevation − horizon) / semi-diameter, clamped to ±1; the hidden part is a circular segment.
 * MODELED: uniform disc (no limb darkening; see `limbDarkenedFraction` for the intensity-weighted version),
 * horizon treated as a straight line across the disc.
 */
export function discVisibleFraction(elCenterDeg: number, semiDiameterDeg: number, horizonDeg: number): number {
  const d = (elCenterDeg - horizonDeg) / semiDiameterDeg;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

/** Linear limb-darkening coefficient of the Sun in visible light: I(μ) = I₀·[1 − u·(1 − μ)]. */
export const LIMB_DARKENING_U = 0.6;

/**
 * Intensity-weighted fraction (0–1) of the solar disc above a straight horizon (peer-review gap 8).
 *
 * The Sun's edge is dimmer than its centre, so when only the top limb clears a ridge the AREA fraction overstates
 * the light. With y the height above the disc centre in units of its radius and x across it, the brightness is
 * I = 1 − u + u·√(1 − x² − y²). Integrating over x gives a strip weight S(y) = 2(1−u)√(1−y²) + u·(π/2)(1−y²), and
 * integrating S from the horizon line upward has a closed form (no numerical error):
 *   F(y) = (1−u)·[y√(1−y²) + asin y] + u·(π/2)·(y − y³/3),   visible = [F(1) − F(y₀)] / [F(1) − F(−1)].
 * The denominator is π·(1 − u/3), the disc's total flux. MODELED: straight horizon across the disc; 1-D profile of
 * the limb darkening.
 */
export function limbDarkenedFraction(
  elCenterDeg: number,
  semiDiameterDeg: number,
  horizonDeg: number,
  u = LIMB_DARKENING_U,
): number {
  const d = (elCenterDeg - horizonDeg) / semiDiameterDeg;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  const F = (y: number) => (1 - u) * (y * Math.sqrt(1 - y * y) + Math.asin(y)) + u * (Math.PI / 2) * (y - (y * y * y) / 3);
  const y0 = -d; // disc-centre-relative height of the horizon line
  return (F(1) - F(y0)) / (F(1) - F(-1));
}

/**
 * Fraction (0–1) of the Sun's disc area covered by the Earth's disc as seen from a lunar site: a lunar eclipse seen
 * from the Moon is Earth passing in front of the Sun. Two-circle overlap with angular radii r (Sun) and R (Earth)
 * and centre separation d, all in the same angular unit (peer-review gap 4). Uniform disc; the atmosphere's
 * reddened ring (which keeps the Moon faintly lit from Earth's side) is not modelled.
 */
export function earthCoverFraction(sepDeg: number, sunRadiusDeg: number, earthRadiusDeg: number): number {
  const d = sepDeg;
  const r = sunRadiusDeg;
  const R = earthRadiusDeg;
  if (d >= r + R) return 0;
  if (d <= R - r) return 1; // Sun entirely behind Earth (R > r)
  if (d <= r - R) return (R * R) / (r * r); // Earth entirely inside the Sun's disc: an annular transit
  const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r));
  const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R));
  const c = 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R));
  return (a + b - c) / (Math.PI * r * r);
}

/** Angle between two directions given as unit-length-agnostic vectors, degrees. */
export function angleBetweenDeg(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = Math.hypot(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
  return Math.atan2(cross, dot) * (180 / Math.PI); // atan2 form: exact for tiny and near-180° separations
}

/** Solar irradiance at the Moon's current distance from the Sun, W/m² on a surface facing the Sun. */
export function solarIrradiance(sunRangeKm: number): number {
  return SOLAR_CONSTANT_W_M2 * (AU_KM / sunRangeKm) ** 2;
}

/**
 * MODELED irradiance available to a panel, W/m²: the intensity-weighted disc share that clears the terrain (and
 * is not behind the Earth) times the irradiance, either for a Sun-facing panel or for one lying flat on the ground
 * (scaled by sin of the elevation of the disc centre, floored at 0).
 */
export function panelIrradiance(
  sunRangeKm: number,
  elCenterDeg: number,
  semiDiameterDeg: number,
  horizonDeg: number,
  eclipseCover = 0,
): { sunFacing: number; flat: number; discFraction: number } {
  const disc = limbDarkenedFraction(elCenterDeg, semiDiameterDeg, horizonDeg) * (1 - eclipseCover);
  const e = solarIrradiance(sunRangeKm);
  return {
    discFraction: disc,
    sunFacing: e * disc,
    flat: e * disc * Math.max(0, Math.sin((Math.max(elCenterDeg, 0) * Math.PI) / 180)),
  };
}
