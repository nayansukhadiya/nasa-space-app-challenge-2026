import { describe, expect, it } from "vitest";
import { BANDS, fsplDb, lightTimeUnits } from "./comms";
import { AU_KM, discVisibleFraction, panelIrradiance, solarIrradiance } from "./solar";

describe("sun disc visibility", () => {
  it("is 0, 0.5 and 1 when the disc is fully below, bisected by, and fully above the horizon", () => {
    expect(discVisibleFraction(-1, 0.27, 0)).toBe(0);
    expect(discVisibleFraction(0, 0.27, 0)).toBeCloseTo(0.5, 12);
    expect(discVisibleFraction(1, 0.27, 0)).toBe(1);
  });
  it("is monotonic and symmetric about the half-way point", () => {
    let prev = -1;
    for (let el = -0.3; el <= 0.3; el += 0.01) {
      const f = discVisibleFraction(el, 0.27, 0);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(discVisibleFraction(0.1, 0.27, 0) + discVisibleFraction(-0.1, 0.27, 0)).toBeCloseTo(1, 12);
  });
  it("matches the known circular-segment area at d = 0.5 (visible ≈ 0.804)", () => {
    // hidden cap = (acos(0.5) − 0.5·√0.75)/π = 0.1955
    expect(discVisibleFraction(0.135, 0.27, 0)).toBeCloseTo(1 - 0.19550, 4);
  });
});

describe("solar irradiance", () => {
  it("is 1360.8 W/m² at 1 AU and follows the inverse-square law", () => {
    expect(solarIrradiance(AU_KM)).toBeCloseTo(1360.8, 6);
    expect(solarIrradiance(AU_KM * 2)).toBeCloseTo(1360.8 / 4, 6);
  });
  it("a flat panel gets almost nothing from a ~1° Sun while a sun-facing one gets nearly all of it", () => {
    const p = panelIrradiance(AU_KM, 1.5, 0.27, 0);
    expect(p.discFraction).toBe(1);
    expect(p.sunFacing).toBeCloseTo(1360.8, 3);
    expect(p.flat / p.sunFacing).toBeCloseTo(Math.sin((1.5 * Math.PI) / 180), 6);
    expect(p.flat).toBeLessThan(40);
  });
});

describe("free-space path loss", () => {
  it("matches the textbook value for the Earth–Moon distance at S-band (~211 dB)", () => {
    expect(fsplDb(384_400, 2.2)).toBeGreaterThan(210.8);
    expect(fsplDb(384_400, 2.2)).toBeLessThan(211.2);
  });
  it("rises 6.02 dB per doubling of distance or frequency, so Ka costs ~21.5 dB more than S", () => {
    expect(fsplDb(768_800, 2.2) - fsplDb(384_400, 2.2)).toBeCloseTo(6.0206, 3);
    expect(fsplDb(384_400, 26) - fsplDb(384_400, 2.2)).toBeCloseTo(20 * Math.log10(26 / 2.2), 6);
    expect(BANDS.map((b) => b.name)).toEqual(["S", "X", "Ka"]);
  });
  it("converts distance to light time in ms, s and min", () => {
    const t = lightTimeUnits(384_400);
    expect(t.s).toBeCloseTo(384_400 / 299_792.458, 9);
    expect(t.ms).toBeCloseTo(1282.2, 1);
    expect(t.min).toBeCloseTo(t.s / 60, 12);
  });
});
