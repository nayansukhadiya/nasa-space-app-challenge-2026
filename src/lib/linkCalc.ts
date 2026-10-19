import { moonStateAt } from "@/astro/cache";
import { C_KM_S, EARTH_RADIUS_KM } from "@/astro/constants";
import { moonState } from "@/astro/frames";
import type { HorizonMask } from "@/astro/horizon";
import {
  type LinkResult,
  atmosphericLossDb,
  dishGainDb,
  dopplerHz,
  linkBudget,
  rangeRateKmS,
  stationRangeRateKmS,
} from "@/astro/link";
import { type RelayOrbit, relayLink } from "@/astro/relay";
import { type Site } from "@/astro/site";
import { relativisticShiftHz, shapiroDelayS } from "@/astro/relativity";
import { stationStates } from "@/astro/stations";
import { norm, sub } from "@/astro/vec";
import { type DsnStatus, type StationLink, dsnStatus, earthStatus } from "@/astro/visibility";
import type { LinkSettings } from "@/store/link";

/** Pointing loss for a fixed pointing error, dB: 12·(err/θ3dB)², with θ3dB ≈ 70·λ/D degrees. */
export function pointingLossDb(diameterM: number, freqGHz: number, errDeg: number): number {
  const lambda = C_KM_S * 1000 / (freqGHz * 1e9);
  const theta3 = (70 * lambda) / diameterM;
  return 12 * (errDeg / theta3) ** 2;
}

export interface DirectionResult {
  /** One entry per radio hop (1 for a direct link, 2 through a relay). */
  hops: Array<{ label: string; distanceKm: number; budget: LinkResult }>;
  /** Worst hop's margin, dB. */
  marginDb: number;
  locked: boolean;
}

export interface LiveLink {
  /**
   * Is there a usable path? Direct: some DSN station clears the site's terrain AND has the Moon above its own 10°
   * keep-out. Relay: the site sees the relay, the relay sees Earth, and some station has the Moon up.
   */
  available: boolean;
  /** Station-by-station visibility from the site (terrain at the mast height). */
  dsn: DsnStatus;
  /** The station the link is budgeted to (best mutually visible one), or null when none. */
  station: StationLink | null;
  /** Earth's centre above the terrain horizon at the mast height. */
  earthVisible: boolean;
  earthElDeg: number;
  earthAzDeg: number;
  /** Total path length, km, and its one-way light time, ms. */
  pathKm: number;
  lightTimeMs: number;
  /** Moon → Earth. */
  down: DirectionResult;
  /** Earth → Moon. */
  up: DirectionResult;
  /** Kinematic Doppler (range rate to the station, including Earth's rotation), Hz. */
  dopplerDownHz: number;
  dopplerUpHz: number;
  /** Mean general-relativistic clock-rate shift of a lunar carrier, Hz (+ = arrives higher). */
  relativisticDownHz: number;
  relativisticUpHz: number;
  rangeRateKmS: number;
  /** Earth-atmosphere clear-air loss at the station's elevation, dB (applied to the Earth end only). */
  atmosDownDb: number;
  atmosUpDb: number;
  /** Shapiro delay of the path, seconds (GR; ~1e-10 s). */
  shapiroS: number;
}

function direction(
  s: LinkSettings,
  freqGHz: number,
  rateKbps: number,
  txEnd: "moon" | "earth",
  hopsKm: Array<{ label: string; km: number; moonToMoon?: boolean }>,
  /** Extra loss on the hop that ends at Earth (atmosphere), dB. */
  earthHopLossDb = 0,
): DirectionResult {
  const hops = hopsKm.map((h) => {
    // A relay hop is moon-dish ↔ moon-dish; the Earth hop is moon-dish ↔ Earth dish.
    const txDish = h.moonToMoon ? s.moonDishM : txEnd === "moon" ? s.moonDishM : s.earthDishM;
    const rxDish = h.moonToMoon ? s.moonDishM : txEnd === "moon" ? s.earthDishM : s.moonDishM;
    const txPower = h.moonToMoon ? s.moonTxW : txEnd === "moon" ? s.moonTxW : s.earthTxW;
    const txErr = h.moonToMoon || txEnd === "moon" ? s.moonPointErrDeg : s.earthPointErrDeg;
    const rxErr = h.moonToMoon || txEnd === "earth" ? s.moonPointErrDeg : s.earthPointErrDeg;
    const rxT = h.moonToMoon || txEnd === "earth" ? s.tSysMoonK : s.tSysEarthK;
    const budget = linkBudget({
      txPowerW: txPower,
      txGainDb: dishGainDb(txDish, freqGHz),
      rxGainDb: dishGainDb(rxDish, freqGHz),
      freqGHz,
      distanceKm: h.km,
      miscLossDb:
        s.miscLossDb +
        pointingLossDb(txDish, freqGHz, txErr) +
        pointingLossDb(rxDish, freqGHz, rxErr) +
        (h.moonToMoon ? 0 : earthHopLossDb),
      tSysK: rxT,
      dataRateBps: rateKbps * 1000,
      requiredEbN0Db: s.requiredEbN0Db,
    });
    return { label: h.label, distanceKm: h.km, budget };
  });
  const marginDb = Math.min(...hops.map((h) => h.budget.marginDb));
  return { hops, marginDb, locked: marginDb >= 0 };
}

/**
 * COMPUTED live link for a site at one instant, from the user's settings. Terrain blocking uses `mask`, which must
 * have been computed for the mast height. Free-space only: no rain, atmosphere or interference.
 */
export function computeLink(site: Site, mask: HorizonMask, s: LinkSettings, tMs: number, relay: RelayOrbit | null): LiveLink {
  const st = moonStateAt(tMs);
  const e = earthStatus(st, site, mask);
  const dsn = dsnStatus(st, site, mask);
  const stationUp = stationStates(st).some((x) => x.moonElDeg >= 10);
  // Budget distance: the chosen station when there is one, otherwise the Earth's centre (shown as "would be").
  const station = dsn.best;
  const earthHopKm = station ? station.rangeKm : e.rangeKm;
  let available = dsn.linked;
  let hopsKm: Array<{ label: string; km: number; moonToMoon?: boolean }> = [
    { label: station ? `Moon ↔ ${station.name}` : "Moon ↔ Earth", km: earthHopKm },
  ];
  let pathKm = earthHopKm;

  if (s.path === "relay" && relay) {
    const l = relayLink(relay, site, mask, tMs, st.earthKm);
    const hop2 = norm(sub(st.earthKm, l.posKm));
    available = l.linked && stationUp;
    pathKm = l.rangeKm + hop2;
    hopsKm = [
      { label: "Site ↔ relay", km: l.rangeKm, moonToMoon: true },
      { label: "Relay ↔ Earth", km: hop2 },
    ];
  }

  const stationEl = station?.moonElAtStationDeg ?? stationStates(st).reduce((m, x) => Math.max(m, x.moonElDeg), 10);
  const atmosDown = atmosphericLossDb(s.downGHz, stationEl);
  const atmosUp = atmosphericLossDb(s.upGHz, stationEl);

  const stateAt = (off: number) => moonState(new Date(tMs + off * 1000));
  const rr = station ? stationRangeRateKmS(stateAt, site, station.id) : rangeRateKmS(stateAt, site);
  return {
    available,
    dsn,
    station,
    earthVisible: e.visible,
    earthElDeg: e.elDeg,
    earthAzDeg: e.azDeg,
    pathKm,
    lightTimeMs: (pathKm / C_KM_S) * 1000,
    down: direction(s, s.downGHz, s.downRateKbps, "moon", hopsKm, atmosDown),
    up: direction(s, s.upGHz, s.upRateKbps, "earth", hopsKm, atmosUp),
    dopplerDownHz: dopplerHz(s.downGHz, rr),
    dopplerUpHz: dopplerHz(s.upGHz, rr),
    relativisticDownHz: relativisticShiftHz(s.downGHz),
    relativisticUpHz: -relativisticShiftHz(s.upGHz), // an Earth carrier is seen from a faster clock: shifted the other way
    rangeRateKmS: rr,
    atmosDownDb: atmosDown,
    atmosUpDb: atmosUp,
    shapiroS: shapiroDelayS(EARTH_RADIUS_KM, st.earthMoonKm, Math.max(1, earthHopKm)),
  };
}
