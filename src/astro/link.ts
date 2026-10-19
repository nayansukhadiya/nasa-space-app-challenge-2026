import { C_KM_S } from "./constants";
import type { MoonState } from "./frames";
import { fsplDb } from "./comms";
import { type Site, sitePositionKm } from "./site";
import { stationStates } from "./stations";
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

/**
 * Typical CLEAR-AIR zenith attenuation of Earth's atmosphere (oxygen + water vapour) at a dry-ish ground station,
 * dB, by frequency in GHz. MODELED: order-of-magnitude values from the shape of ITU-R P.676 (a weak oxygen/water
 * floor, rising toward the 22 GHz water-vapour line). Rain, cloud and scintillation are NOT included.
 */
const ZENITH_ATTEN_DB: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.02],
  [2.2, 0.03],
  [8.4, 0.04],
  [15, 0.08],
  [22, 0.25],
  [26, 0.22],
  [32, 0.2],
  [40, 0.3],
];

/**
 * Atmospheric loss through Earth's air at a station elevation: zenith value × path-length factor 1/sin(el)
 * (plane-parallel, so valid down to ~5°; below that the factor is capped). Applies only to the Earth end of a link.
 */
export function atmosphericLossDb(freqGHz: number, stationElDeg: number): number {
  const tbl = ZENITH_ATTEN_DB;
  let z = tbl[tbl.length - 1][1];
  if (freqGHz <= tbl[0][0]) z = tbl[0][1];
  else {
    for (let i = 1; i < tbl.length; i++) {
      if (freqGHz <= tbl[i][0]) {
        const [f0, a0] = tbl[i - 1];
        const [f1, a1] = tbl[i];
        z = a0 + ((a1 - a0) * (Math.log(freqGHz) - Math.log(f0))) / (Math.log(f1) - Math.log(f0));
        break;
      }
    }
  }
  const el = Math.max(5, stationElDeg);
  return z / Math.sin((el * Math.PI) / 180);
}

/**
 * Range rate, km/s (positive = receding), from a lunar site to a specific ground station, by central difference of
 * the straight-line range over ±`dtS`. Includes the Earth's rotation (≈ ±0.4 km/s of line-of-sight speed at a station
 * near the horizon), which is why a DSN Doppler is far larger than the Earth-centre one.
 */
export function stationRangeRateKmS(
  stateAt: (offsetS: number) => MoonState,
  site: Pick<Site, "latDeg" | "lonDeg" | "heightKm">,
  stationId: string,
  dtS = 30,
): number {
  const range = (off: number): number => {
    const s = stationStates(stateAt(off)).find((x) => x.station.id === stationId);
    if (!s) return Number.NaN;
    return norm(sub(s.posKm, sitePositionKm(site.latDeg, site.lonDeg, site.heightKm ?? 0)));
  };
  return (range(dtS) - range(-dtS)) / (2 * dtS);
}
