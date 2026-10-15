import { RAD } from "./constants";

/** Total solar irradiance at 1 AU, W/m² (Kopp & Lean 2011 reference value, 1360.8). */
export const SOLAR_CONSTANT_W_M2 = 1360.8;
export const AU_KM = 149_597_870.7;

/**
 * Fraction (0–1) of the solar disc's AREA above a straight horizon.
 * `d` = (centre elevation − horizon) / semi-diameter, clamped to ±1; the hidden part is a circular segment.
 * MODELED: uniform disc (no limb darkening), horizon treated as a straight line across the disc.
 */
export function discVisibleFraction(elCenterDeg: number, semiDiameterDeg: number, horizonDeg: number): number {
  const d = (elCenterDeg - horizonDeg) / semiDiameterDeg;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

/** Solar irradiance at the Moon's current distance from the Sun, W/m² on a surface facing the Sun. */
export function solarIrradiance(sunRangeKm: number): number {
  return SOLAR_CONSTANT_W_M2 * (AU_KM / sunRangeKm) ** 2;
}

/**
 * MODELED irradiance available to a panel, W/m²: the disc fraction that clears the terrain
 * times the irradiance, either for a Sun-facing panel or for one lying flat on the ground
 * (scaled by sin of the elevation of the disc centre, floored at 0).
 */
export function panelIrradiance(
  sunRangeKm: number,
  elCenterDeg: number,
  semiDiameterDeg: number,
  horizonDeg: number,
): { sunFacing: number; flat: number; discFraction: number } {
  const disc = discVisibleFraction(elCenterDeg, semiDiameterDeg, horizonDeg);
  const e = solarIrradiance(sunRangeKm);
  return {
    discFraction: disc,
    sunFacing: e * disc,
    flat: e * disc * Math.max(0, Math.sin((Math.max(elCenterDeg, 0) / RAD) * 1)),
  };
}
