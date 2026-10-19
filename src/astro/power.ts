import { moonStateAt } from "./cache";
import type { HorizonMask } from "./horizon";
import { type Site, lookAngles } from "./site";
import { AU_KM, discVisibleFraction, solarIrradiance } from "./solar";
import { earthStatus, sunStatus } from "./visibility";

/** How the solar array is mounted. */
export type PanelMode = "flat" | "vertical" | "tracking";

export interface PowerParams {
  panelAreaM2: number;
  /** Cell efficiency, 0–1 (≈ 0.28 for good space-grade triple-junction cells). */
  efficiency: number;
  mode: PanelMode;
  /** For `vertical`: the compass azimuth the panel faces, degrees. */
  verticalAzDeg: number;
  batteryWh: number;
  /** Always-on load (computer, heaters, receiver), W. */
  housekeepingW: number;
  /** RF transmit power, W. */
  txPowerW: number;
  /** Transmitter DC → RF efficiency, 0–1. */
  txEfficiency: number;
}

export const DEFAULT_POWER: PowerParams = {
  panelAreaM2: 1.0,
  efficiency: 0.28,
  mode: "flat",
  verticalAzDeg: 0,
  batteryWh: 200,
  housekeepingW: 25,
  txPowerW: 20,
  txEfficiency: 0.35,
};

/**
 * MODELED electrical power from the array, W. Irradiance = solar constant at the Sun's real distance, times the
 * share of the solar disc above the terrain horizon (limb-darkened, minus any Earth eclipse), times the cosine of
 * the angle between the Sun and the panel normal (flat: sin el; vertical: cos el · cos Δaz; tracking: 1).
 * No dust, no temperature derating: an upper bound, not a mission figure.
 */
export function panelPowerW(
  p: PowerParams,
  sun: {
    elDeg: number;
    azDeg: number;
    semiDiameterDeg: number;
    horizonDeg: number;
    rangeKm: number;
    /** Net light fraction from sunStatus (limb-darkened, eclipse-aware). Falls back to the uniform-disc area. */
    fraction?: number;
  },
): number {
  const disc = sun.fraction ?? discVisibleFraction(sun.elDeg, sun.semiDiameterDeg, sun.horizonDeg);
  if (disc <= 0) return 0;
  const e = solarIrradiance(sun.rangeKm) * disc;
  const el = (Math.max(sun.elDeg, 0) * Math.PI) / 180;
  let cosInc = 1;
  if (p.mode === "flat") cosInc = Math.sin(el);
  else if (p.mode === "vertical") {
    cosInc = Math.max(0, Math.cos(el) * Math.cos(((sun.azDeg - p.verticalAzDeg) * Math.PI) / 180));
  }
  return e * cosInc * p.panelAreaM2 * p.efficiency;
}

export interface PowerSeries {
  tMs: Float64Array;
  solarW: Float32Array;
  loadW: Float32Array;
  socWh: Float32Array;
  /** 1 while the Earth is in line of sight AND the radio is powered. */
  txOn: Uint8Array;
  /** Fraction of the span with the radio powered and Earth in view. */
  txFraction: number;
  /** Fraction of the span the electronics are alive at all. */
  aliveFraction: number;
  minSocWh: number;
  /** Energy generated over the span, Wh. */
  generatedWh: number;
}

/**
 * Hour-by-hour battery simulation over [startMs, endMs). The radio transmits only when the Earth is above the
 * terrain horizon (at the mast height the mask was computed for) and the system is alive. When the battery is
 * empty and the Sun cannot even cover the housekeeping load, everything goes dark until light returns.
 */
export function simulatePower(
  site: Site,
  mask: HorizonMask,
  p: PowerParams,
  startMs: number,
  endMs: number,
  stepMs = 3_600_000,
): PowerSeries {
  const n = Math.max(1, Math.floor((endMs - startMs) / stepMs));
  const tMs = new Float64Array(n);
  const solarW = new Float32Array(n);
  const loadW = new Float32Array(n);
  const socWh = new Float32Array(n);
  const txOn = new Uint8Array(n);
  const dtH = stepMs / 3_600_000;
  let soc = p.batteryWh; // start full
  let alive = 0;
  let tx = 0;
  let minSoc = soc;
  let gen = 0;
  const txLoad = p.txPowerW / Math.max(0.01, p.txEfficiency);

  for (let i = 0; i < n; i++) {
    const t = startMs + i * stepMs;
    const st = moonStateAt(t);
    const sun = sunStatus(st, site, mask);
    const earthUp = earthStatus(st, site, mask).visible;
    const solar = panelPowerW(p, sun);
    const canRun = soc > 0 || solar >= p.housekeepingW;
    const transmit = canRun && earthUp;
    const load = canRun ? p.housekeepingW + (transmit ? txLoad : 0) : 0;
    soc = Math.min(p.batteryWh, Math.max(0, soc + (solar - load) * dtH));
    tMs[i] = t;
    solarW[i] = solar;
    loadW[i] = load;
    socWh[i] = soc;
    txOn[i] = transmit ? 1 : 0;
    if (canRun) alive++;
    if (transmit) tx++;
    gen += solar * dtH;
    minSoc = Math.min(minSoc, soc);
  }
  return { tMs, solarW, loadW, socWh, txOn, txFraction: tx / n, aliveFraction: alive / n, minSocWh: minSoc, generatedWh: gen };
}

/** Sun direction helper used by the 3D beam/legend: azimuth/elevation of the Sun from the site. */
export function sunLook(site: Site, tMs: number) {
  return lookAngles(moonStateAt(tMs).sunKm, site);
}

export { AU_KM };
