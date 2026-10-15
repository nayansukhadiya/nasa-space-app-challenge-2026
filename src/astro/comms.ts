import { C_KM_S } from "./constants";

/**
 * Nominal band centres used for CONTEXT ONLY: S ≈ 2, X ≈ 8, Ka ≈ 26 GHz (the plan's bands).
 * No band is attributed to any specific mission.
 */
export const BANDS = [
  { name: "S", ghz: 2.2 },
  { name: "X", ghz: 8.4 },
  { name: "Ka", ghz: 26 },
] as const;

/**
 * Free-space path loss, dB: 20·log10(4π·d·f / c). COMPUTED from the live site→Earth distance.
 * Ignores antennas, pointing, atmosphere and polarisation, so it is the geometric loss only.
 */
export function fsplDb(distanceKm: number, freqGHz: number): number {
  const d = distanceKm * 1000;
  const f = freqGHz * 1e9;
  const c = C_KM_S * 1000;
  return 20 * Math.log10((4 * Math.PI * d * f) / c);
}

export function lightTimeSeconds(distanceKm: number): number {
  return distanceKm / C_KM_S;
}

/** One value in the three units a human reads: ms, s and (when meaningful) minutes. */
export function lightTimeUnits(distanceKm: number): { ms: number; s: number; min: number } {
  const s = lightTimeSeconds(distanceKm);
  return { ms: s * 1000, s, min: s / 60 };
}
