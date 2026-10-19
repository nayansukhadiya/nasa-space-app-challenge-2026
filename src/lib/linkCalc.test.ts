import { describe, expect, it } from "vitest";
import { atmosphericLossDb } from "@/astro/link";
import { flatHorizon } from "@/astro/horizon";
import type { Site } from "@/astro/site";
import { DEFAULT_LINK } from "@/store/link";
import { computeLink } from "./linkCalc";

const near: Site = { id: "n", name: "Near side", latDeg: 0, lonDeg: 0 };
const T0 = Date.UTC(2026, 10, 14);

describe("atmospheric loss", () => {
  it("is a fraction of a dB at X-band and several times larger near the 22 GHz water line", () => {
    expect(atmosphericLossDb(8.4, 90)).toBeCloseTo(0.04, 3);
    expect(atmosphericLossDb(26, 90)).toBeGreaterThan(5 * atmosphericLossDb(8.4, 90));
  });
  it("grows with the cosecant of elevation and is capped below 5°", () => {
    expect(atmosphericLossDb(8.4, 30)).toBeCloseTo(2 * atmosphericLossDb(8.4, 90), 6);
    expect(atmosphericLossDb(8.4, 1)).toBeCloseTo(atmosphericLossDb(8.4, 5), 12);
  });
});

describe("live link through the DSN", () => {
  it("is available exactly when a station is mutually visible, and budgets against that station", () => {
    let up = 0;
    let down = 0;
    for (let h = 0; h < 48; h++) {
      const l = computeLink(near, flatHorizon(), DEFAULT_LINK, T0 + h * 3_600_000, null);
      expect(l.available).toBe(l.dsn.linked);
      if (l.available) {
        up++;
        expect(l.station).not.toBeNull();
        expect(l.station!.linked).toBe(true);
        expect(l.down.hops[0].label).toContain(l.station!.name);
        expect(l.pathKm).toBeCloseTo(l.station!.rangeKm, 6);
      } else {
        down++;
        expect(l.station).toBeNull();
      }
    }
    // a near-side equatorial site hears some station most of the day, but not all of it
    expect(up).toBeGreaterThan(24);
    expect(up + down).toBe(48);
  });
  it("light time is the station range ÷ c, around 1.19–1.36 s", () => {
    for (let h = 0; h < 24; h += 3) {
      const l = computeLink(near, flatHorizon(), DEFAULT_LINK, T0 + h * 3_600_000, null);
      if (!l.available) continue;
      expect(l.lightTimeMs).toBeGreaterThan(1180);
      expect(l.lightTimeMs).toBeLessThan(1370);
    }
  });
  it("Doppler follows the Earth's rotation: kHz-scale at X-band, sign flipping through the day", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let h = 0; h < 24; h++) {
      const l = computeLink(near, flatHorizon(), DEFAULT_LINK, T0 + h * 3_600_000, null);
      if (!l.available) continue;
      min = Math.min(min, l.dopplerDownHz);
      max = Math.max(max, l.dopplerDownHz);
      expect(Math.abs(l.rangeRateKmS)).toBeLessThan(0.8); // km/s: Earth spin (<0.47) + lunar orbital motion
    }
    expect(max).toBeGreaterThan(1_000);
    expect(min).toBeLessThan(-1_000);
    expect(max).toBeLessThan(40_000);
  });
  it("adds the ~5 Hz relativistic carrier shift and a ~0.1 ns Shapiro delay", () => {
    const l = computeLink(near, flatHorizon(), { ...DEFAULT_LINK, downGHz: 8.4 }, T0, null);
    expect(l.relativisticDownHz).toBeGreaterThan(5);
    expect(l.relativisticDownHz).toBeLessThan(6);
    expect(l.relativisticUpHz).toBeLessThan(0);
    expect(l.shapiroS).toBeGreaterThan(1e-11);
    expect(l.shapiroS).toBeLessThan(1e-9);
  });
  it("a higher carrier costs more path loss: Ka margin < X margin for identical hardware", () => {
    const x = computeLink(near, flatHorizon(), { ...DEFAULT_LINK, downGHz: 8.4 }, T0, null);
    const ka = computeLink(near, flatHorizon(), { ...DEFAULT_LINK, downGHz: 26 }, T0, null);
    expect(ka.down.hops[0].budget.fsplDb - x.down.hops[0].budget.fsplDb).toBeCloseTo(20 * Math.log10(26 / 8.4), 6);
    expect(ka.atmosDownDb).toBeGreaterThan(x.atmosDownDb);
  });
  it("a mask that hides every station blocks the link even though the Earth's centre geometry is unchanged", () => {
    const wall = new Float32Array(1440).fill(89);
    const l = computeLink(near, wall, DEFAULT_LINK, T0, null);
    expect(l.available).toBe(false);
    expect(l.station).toBeNull();
  });
});
