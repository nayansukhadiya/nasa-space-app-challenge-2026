import { C_KM_S, MOON_RADIUS_KM } from "./constants";
import { GM_EARTH, GM_MOON } from "./gravity";

/** Earth's geoid potential W₀ (IERS/IAU 2000 defining constant), km²/s²: potential + rotation at mean sea level. */
export const EARTH_GEOID_W0 = 62.636856; // 6.26368560e7 m²/s²

/** Mean Earth–Moon distance, km, and the Moon's mean orbital speed relative to Earth, km/s. */
const MEAN_EARTH_MOON_KM = 384_399;
const MOON_ORBITAL_SPEED_KMS = 1.022;

/**
 * Fractional rate by which a clock on the Moon's surface runs FAST relative to one on Earth's geoid:
 *   Δ = [W₀ − (GM☾/R☾ + GM⊕/d + v²/2)] / c²
 * Terms: Earth's surface potential (incl. spin), the Moon's own potential, Earth's potential at the Moon, and the
 * Moon's orbital kinetic term. The Sun's potential is common to both clocks and cancels to first order.
 * Result ≈ 6.5e-10, about 56 µs per day (Ashby & Patla 2024 give 56.02 µs/day); eccentricity adds a few µs/day of
 * monthly wobble that this mean value leaves out. COMPUTED from constants, MODELED as a mean.
 */
export function lunarClockRateOffset(): number {
  const moonSide = GM_MOON / MOON_RADIUS_KM + GM_EARTH / MEAN_EARTH_MOON_KM + (MOON_ORBITAL_SPEED_KMS * MOON_ORBITAL_SPEED_KMS) / 2;
  return (EARTH_GEOID_W0 - moonSide) / (C_KM_S * C_KM_S);
}

/** Microseconds per day a lunar clock gains on Earth. */
export const lunarClockGainUsPerDay = (): number => lunarClockRateOffset() * 86_400 * 1e6;

/**
 * Gravitational + clock-rate shift of a signal sent from the Moon's surface to Earth, Hz: a lunar oscillator ticks
 * faster than an Earth one, so a carrier with nominal frequency f (by the Moon's clock) arrives f·Δ high.
 * This sits on top of the kinematic Doppler (which is ~1e-6, thousands of times bigger, so the two must be
 * separated to see it). At 8.4 GHz it is ≈ +5.4 Hz.
 */
export const relativisticShiftHz = (freqGHz: number): number => freqGHz * 1e9 * lunarClockRateOffset();

/**
 * Shapiro (gravitational) delay for a signal between a lunar site and an Earth station, seconds:
 *   Δt = (2GM⊕/c³) · ln[(r₁ + r₂ + ρ) / (r₁ + r₂ − ρ)]
 * with r₁, r₂ the endpoints' distances from Earth's centre and ρ their separation. Only Earth's field is included
 * (the Moon's and Sun's add ~10 ps and a common term). About 0.1 ns, negligible next to the 1.28 s light time, but
 * it is the real GR correction and shows the scale.
 */
export function shapiroDelayS(stationDistFromEarthCentreKm: number, siteDistFromEarthCentreKm: number, separationKm: number): number {
  const sum = stationDistFromEarthCentreKm + siteDistFromEarthCentreKm;
  return ((2 * GM_EARTH) / (C_KM_S * C_KM_S * C_KM_S)) * Math.log((sum + separationKm) / (sum - separationKm));
}

