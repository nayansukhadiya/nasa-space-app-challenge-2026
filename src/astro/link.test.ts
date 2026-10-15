import { describe, expect, it } from "vitest";
import { moonStateAt } from "./cache";
import { fsplDb } from "./comms";
import { flatHorizon } from "./horizon";
import { DEFAULT_POWER, panelPowerW, simulatePower } from "./power";
import { dishGainDb, dopplerHz, earthRangeKm, linkBudget, rangeRateKmS } from "./link";
import { moonState } from "./frames";

describe("dish gain", () => {
  it("a 34 m dish at X-band (8.4 GHz) is about 67 dBi, and gain rises 6 dB per doubling of diameter or frequency", () => {
    expect(dishGainDb(34, 8.4)).toBeGreaterThan(66);
    expect(dishGainDb(34, 8.4)).toBeLessThan(68.5);
    expect(dishGainDb(2, 8.4) - dishGainDb(1, 8.4)).toBeCloseTo(6.0206, 3);
    expect(dishGainDb(1, 16.8) - dishGainDb(1, 8.4)).toBeCloseTo(6.0206, 3);
  });
});

describe("link budget", () => {
  const base = {
    txPowerW: 20,
    txGainDb: dishGainDb(0.6, 8.4),
    rxGainDb: dishGainDb(34, 8.4),
    freqGHz: 8.4,
    distanceKm: 384_400,
    miscLossDb: 3,
    tSysK: 30,
    dataRateBps: 1e6,
    requiredEbN0Db: 2.5,
  };

  it("adds up as Pr = EIRP − FSPL + Gr − L and the margin is Eb/N0 minus the requirement", () => {
    const r = linkBudget(base);
    expect(r.fsplDb).toBeCloseTo(fsplDb(384_400, 8.4), 9);
    expect(r.prDbw).toBeCloseTo(r.eirpDbw - r.fsplDb + base.rxGainDb - base.miscLossDb, 9);
    expect(r.marginDb).toBeCloseTo(r.ebn0Db - 2.5, 9);
    expect(r.locked).toBe(r.marginDb >= 0);
  });

  it("margin falls 10 dB for 10× the data rate, 6 dB per doubling of distance, and rises 3 dB for double the power", () => {
    const m = (o: Partial<typeof base>) => linkBudget({ ...base, ...o }).marginDb;
    expect(m({ dataRateBps: 1e7 })).toBeCloseTo(m({}) - 10, 6);
    expect(m({ distanceKm: 768_800 })).toBeCloseTo(m({}) - 6.0206, 3);
    expect(m({ txPowerW: 40 })).toBeCloseTo(m({}) + 3.0103, 3);
  });

  it("a realistic Moon→Earth X-band link (20 W, 0.6 m dish → 34 m dish, 1 Mbps) closes with margin", () => {
    expect(linkBudget(base).locked).toBe(true);
  });

  it("the same transmitter at Ka-band into a small receive dish fails when the data rate is huge", () => {
    const r = linkBudget({ ...base, freqGHz: 26, rxGainDb: dishGainDb(1, 26), dataRateBps: 1e9 });
    expect(r.locked).toBe(false);
  });
});

describe("Doppler", () => {
  it("is positive when approaching, negative when receding, and ~f·v/c in size", () => {
    expect(dopplerHz(8.4, -0.1)).toBeGreaterThan(0);
    expect(dopplerHz(8.4, +0.1)).toBeLessThan(0);
    expect(Math.abs(dopplerHz(8.4, 0.1))).toBeCloseTo((8.4e9 * 0.1) / 299_792.458, 3);
  });

  it("the Moon's range rate from the pole is below ~0.2 km/s (orbital radial speed + rotation)", () => {
    const t = Date.UTC(2026, 10, 14);
    const site = { latDeg: -89.9, lonDeg: 0 };
    const rr = rangeRateKmS((off) => moonState(new Date(t + off * 1000)), site);
    expect(Math.abs(rr)).toBeLessThan(0.2);
    // and agrees with a coarser difference to within a few %
    const rr2 = rangeRateKmS((off) => moonState(new Date(t + off * 1000)), site, 120);
    expect(Math.abs(rr - rr2)).toBeLessThan(0.01);
    expect(earthRangeKm(moonStateAt(t), site)).toBeGreaterThan(356_000);
  });
});

describe("solar power and battery", () => {
  const site = { id: "ch3", name: "Ch-3", latDeg: -69.3733, lonDeg: 32.3191 };
  const landing = Date.UTC(2023, 7, 23, 12, 34);

  it("a panel makes power in the lunar day and none at night, and generation never exceeds the solar constant × area × efficiency", () => {
    const p = { ...DEFAULT_POWER, mode: "tracking" as const };
    const month = 29.530588 * 86_400_000; // one synodic month; a whole number of lunar days averages out the phase
    const s = simulatePower(site, flatHorizon(), p, landing - month, landing + month);
    const max = Math.max(...s.solarW);
    expect(max).toBeGreaterThan(0.9 * 1360 * p.efficiency * p.panelAreaM2 * 0.95); // sun-tracking in full light
    expect(max).toBeLessThanOrEqual(1500 * p.efficiency * p.panelAreaM2);
    expect(Math.min(...s.solarW)).toBe(0);
    // about half the time lit over two whole lunar days
    const lit = s.solarW.filter((w) => w > 0).length / s.solarW.length;
    expect(lit).toBeGreaterThan(0.45);
    expect(lit).toBeLessThan(0.55);
  });

  it("the battery stays within [0, capacity], and a long night with a small battery browns the system out", () => {
    const p = { ...DEFAULT_POWER, batteryWh: 50, mode: "tracking" as const };
    const s = simulatePower(site, flatHorizon(), p, landing - 20 * 86_400_000, landing + 30 * 86_400_000);
    for (const v of s.socWh) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(p.batteryWh + 1e-6);
    }
    expect(s.aliveFraction).toBeLessThan(0.9); // dies during the ~14-day night
    expect(s.aliveFraction).toBeGreaterThan(0.3);
  });

  it("a flat panel collects far less than a sun-tracking one at low sun, and a vertical panel facing the Sun is in between", () => {
    const sun = { elDeg: 3, azDeg: 90, semiDiameterDeg: 0.27, horizonDeg: 0, rangeKm: 149_597_870.7 };
    const track = panelPowerW({ ...DEFAULT_POWER, mode: "tracking" }, sun);
    const flat = panelPowerW({ ...DEFAULT_POWER, mode: "flat" }, sun);
    const vert = panelPowerW({ ...DEFAULT_POWER, mode: "vertical", verticalAzDeg: 90 }, sun);
    expect(flat).toBeLessThan(0.07 * track);
    expect(vert).toBeGreaterThan(0.99 * track * Math.cos((3 * Math.PI) / 180) - 1e-6);
    expect(vert).toBeLessThanOrEqual(track);
    expect(panelPowerW({ ...DEFAULT_POWER, mode: "vertical", verticalAzDeg: 270 }, sun)).toBe(0);
  });
});
