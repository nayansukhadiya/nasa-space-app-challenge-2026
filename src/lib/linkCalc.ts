import { moonStateAt } from "@/astro/cache";
import { C_KM_S } from "@/astro/constants";
import { moonState } from "@/astro/frames";
import type { HorizonMask } from "@/astro/horizon";
import { type LinkResult, dishGainDb, dopplerHz, linkBudget, rangeRateKmS } from "@/astro/link";
import { type RelayOrbit, relayLink } from "@/astro/relay";
import { type Site } from "@/astro/site";
import { norm, sub } from "@/astro/vec";
import { earthStatus } from "@/astro/visibility";
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
  /** Is there a line of sight for the chosen path (terrain at the mast height, relay occlusion)? */
  available: boolean;
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
  dopplerDownHz: number;
  dopplerUpHz: number;
  rangeRateKmS: number;
}

function direction(
  s: LinkSettings,
  freqGHz: number,
  rateKbps: number,
  txEnd: "moon" | "earth",
  hopsKm: Array<{ label: string; km: number; moonToMoon?: boolean }>,
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
      miscLossDb: s.miscLossDb + pointingLossDb(txDish, freqGHz, txErr) + pointingLossDb(rxDish, freqGHz, rxErr),
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
  let available = e.visible;
  let hopsKm: Array<{ label: string; km: number; moonToMoon?: boolean }> = [{ label: "Moon ↔ Earth", km: e.rangeKm }];
  let pathKm = e.rangeKm;

  if (s.path === "relay" && relay) {
    const l = relayLink(relay, site, mask, tMs, st.earthKm);
    const hop2 = norm(sub(st.earthKm, l.posKm));
    available = l.linked;
    pathKm = l.rangeKm + hop2;
    hopsKm = [
      { label: "Site ↔ relay", km: l.rangeKm, moonToMoon: true },
      { label: "Relay ↔ Earth", km: hop2 },
    ];
  }

  const rr = rangeRateKmS((off) => moonState(new Date(tMs + off * 1000)), site);
  return {
    available,
    earthVisible: e.visible,
    earthElDeg: e.elDeg,
    earthAzDeg: e.azDeg,
    pathKm,
    lightTimeMs: (pathKm / C_KM_S) * 1000,
    down: direction(s, s.downGHz, s.downRateKbps, "moon", hopsKm),
    up: direction(s, s.upGHz, s.upRateKbps, "earth", hopsKm),
    dopplerDownHz: dopplerHz(s.downGHz, rr),
    dopplerUpHz: dopplerHz(s.upGHz, rr),
    rangeRateKmS: rr,
  };
}
