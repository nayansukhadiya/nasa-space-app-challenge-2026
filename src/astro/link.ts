import { C_KM_S } from "./constants";
import type { MoonState } from "./frames";
import { fsplDb } from "./comms";
import { type Site, sitePositionKm } from "./site";
import { norm, sub } from "./vec";

/** Boltzmann's constant in dBW/(K·Hz). */
export const BOLTZMANN_DBW = -228.5991672;

const toDb = (x: number): number => 10 * Math.log10(x);

/**
 * Parabolic dish gain, dBi: G = η·(π·D/λ)². COMPUTED from physics; the efficiency is an assumption (0.55 is a
 * typical value for a well-made dish).
 */
export function dishGainDb(diameterM: number, freqGHz: number, efficiency = 0.55): number {
  const lambda = (C_KM_S * 1000) / (freqGHz * 1e9);
  return toDb(efficiency * ((Math.PI * diameterM) / lambda) ** 2);
}

export interface LinkParams {
  txPowerW: number;
  txGainDb: number;
  rxGainDb: number;
  freqGHz: number;
  distanceKm: number;
  /** Pointing, polarisation, feed and cable losses lumped together, dB (≥ 0). */
  miscLossDb: number;
  /** Receiving system noise temperature, K. */
  tSysK: number;
  dataRateBps: number;
  /** Eb/N0 the chosen modulation + coding needs for an acceptable error rate, dB. */
  requiredEbN0Db: number;
}

export interface LinkResult {
  eirpDbw: number;
  fsplDb: number;
  /** Received carrier power, dBW. */
  prDbw: number;
  /** Carrier to noise density, dB-Hz. */
  cn0DbHz: number;
  ebn0Db: number;
  marginDb: number;
  locked: boolean;
}

/**
 * Free-space link budget: Pr = Pt + Gt − FSPL + Gr − L, then C/N0 = Pr − k·T, Eb/N0 = C/N0 − 10·log10(Rb).
 * No atmosphere, rain or interference. COMPUTED from the inputs; the inputs themselves are the simulation's
 * assumptions and are set by the user.
 */
export function linkBudget(p: LinkParams): LinkResult {
  const eirpDbw = toDb(p.txPowerW) + p.txGainDb;
  const loss = fsplDb(p.distanceKm, p.freqGHz);
  const prDbw = eirpDbw - loss + p.rxGainDb - p.miscLossDb;
  const n0 = BOLTZMANN_DBW + toDb(p.tSysK);
  const cn0DbHz = prDbw - n0;
  const ebn0Db = cn0DbHz - toDb(p.dataRateBps);
  const marginDb = ebn0Db - p.requiredEbN0Db;
  return { eirpDbw, fsplDb: loss, prDbw, cn0DbHz, ebn0Db, marginDb, locked: marginDb >= 0 };
}

/** Line-of-sight range from a site to the Earth's centre, km. */
export function earthRangeKm(state: MoonState, site: Pick<Site, "latDeg" | "lonDeg" | "heightKm">): number {
  return norm(sub(state.earthKm, sitePositionKm(site.latDeg, site.lonDeg, site.heightKm ?? 0)));
}

/** Range rate, km/s (positive = receding), by central difference of the range over ±`dtS`. */
export function rangeRateKmS(
  stateAt: (offsetS: number) => MoonState,
  site: Pick<Site, "latDeg" | "lonDeg" | "heightKm">,
  dtS = 30,
): number {
  return (earthRangeKm(stateAt(dtS), site) - earthRangeKm(stateAt(-dtS), site)) / (2 * dtS);
}

/** Doppler shift of a carrier at `freqGHz` for a range rate (km/s, + receding): Δf = −f·ṙ/c, Hz. */
export function dopplerHz(freqGHz: number, rangeRate: number): number {
  return (-freqGHz * 1e9 * rangeRate) / C_KM_S;
}
