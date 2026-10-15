import * as Astro from "astronomy-engine";
import { describe, expect, it } from "vitest";
import { DEG, RAD } from "./constants";
import { eqjToMoonFixed, moonState } from "./frames";
import { flatHorizon } from "./horizon";
import { centreLightTimeMs, lightTimeMs, lookAngles } from "./site";
import { sweep } from "./sweep";
import { mulMV } from "./vec";
import { sunStatus } from "./visibility";

const utc = (s: string) => new Date(s);

describe("Moon-fixed frame", () => {
  it("maps the IAU pole direction onto +Z", () => {
    for (const t of ["2023-08-23T12:34:00Z", "2026-11-14T00:00:00Z", "2030-01-01T00:00:00Z"]) {
      const axis = Astro.RotationAxis(Astro.Body.Moon, utc(t));
      const q = eqjToMoonFixed(utc(t));
      const a = axis.ra * 15 * DEG;
      const d = axis.dec * DEG;
      const pole = mulMV(q, [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]);
      expect(pole[0]).toBeCloseTo(0, 9);
      expect(pole[1]).toBeCloseTo(0, 9);
      expect(pole[2]).toBeCloseTo(1, 9);
    }
  });

  it("agrees with astronomy-engine's independent Libration() on the sub-Earth point", () => {
    // Different algorithm (Meeus-style libration vs IAU pole/spin): they share
    // no code, so agreement validates the whole rotation chain, not just the matrix.
    for (let day = 0; day < 40; day += 1.7) {
      const t = new Date(Date.UTC(2026, 10, 14) + day * 86_400_000);
      const st = moonState(t);
      const lib = Astro.Libration(t);
      const [x, y, z] = st.earthKm;
      const lat = Math.asin(z / st.earthMoonKm) * RAD;
      let lon = Math.atan2(y, x) * RAD;
      if (lon > 180) lon -= 360;
      expect(Math.abs(lat - lib.elat)).toBeLessThan(0.05);
      expect(Math.abs(lon - lib.elon)).toBeLessThan(0.05);
      expect(st.earthMoonKm).toBeCloseTo(lib.dist_km, 0);
    }
  });
});

describe("light time", () => {
  it("stays within the physical Earth–Moon range over a year (1.18–1.36 s)", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let d = 0; d < 365; d += 0.5) {
      const ms = centreLightTimeMs(moonState(new Date(Date.UTC(2026, 0, 1) + d * 86_400_000)));
      lo = Math.min(lo, ms);
      hi = Math.max(hi, ms);
    }
    expect(lo).toBeGreaterThan(1180);
    expect(hi).toBeLessThan(1370);
    // and spans the real perigee/apogee swing rather than a constant
    expect(hi - lo).toBeGreaterThan(100);
  });

  it("site light time differs from centre light time by less than one Moon radius of light", () => {
    const st = moonState(utc("2026-11-14T12:00:00Z"));
    const dc = centreLightTimeMs(st);
    const ds = lightTimeMs(st, { latDeg: -89.9, lonDeg: 0 });
    expect(Math.abs(dc - ds)).toBeLessThan((1737.4 * 1000) / 299_792.458 + 1e-6);
  });
});

describe("south pole illumination geometry", () => {
  it("sun stays within the Moon's ~1.54° axial tilt of the horizon at the pole", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let d = 0; d < 365; d += 0.25) {
      const st = moonState(new Date(Date.UTC(2026, 0, 1) + d * 86_400_000));
      const { elDeg } = lookAngles(st.sunKm, { latDeg: -90, lonDeg: 0 });
      min = Math.min(min, elDeg);
      max = Math.max(max, elDeg);
    }
    expect(max).toBeLessThan(1.8);
    expect(min).toBeGreaterThan(-1.8);
    expect(max).toBeGreaterThan(1.0); // and it genuinely reaches the tilt limit
    expect(min).toBeLessThan(-1.0);
  });

  it("Earth is never far above the horizon from the pole (libration ≤ ~8°)", () => {
    for (let d = 0; d < 60; d += 0.5) {
      const st = moonState(new Date(Date.UTC(2026, 10, 14) + d * 86_400_000));
      const { elDeg } = lookAngles(st.earthKm, { latDeg: -90, lonDeg: 0 });
      expect(Math.abs(elDeg)).toBeLessThan(9);
    }
  });
});

describe("Chandrayaan-3 replay (69.37°S, 32.32°E, 2023-08-23 12:34 UTC)", () => {
  const site = { id: "ch3", name: "Chandrayaan-3", latDeg: -69.3733, lonDeg: 32.3191 };
  const landing = Date.UTC(2023, 7, 23, 12, 34);

  it("sun is up at landing and the daylight window lasts ~14 Earth days", () => {
    expect(sunStatus(moonState(new Date(landing)), site, flatHorizon()).lit).toBe(true);

    const start = landing - 20 * 86_400_000;
    const [r] = sweep([{ site, mask: flatHorizon() }], start, landing + 30 * 86_400_000, 3_600_000);
    const win = r.litWindows.find(([a, b]) => a <= landing && landing < b);
    expect(win).toBeDefined();
    const days = (win![1] - win![0]) / 86_400_000;
    // Flat horizon, no terrain: ~half of the 29.5-day synodic month.
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(16);
  });

  it("is lit roughly half the time over a year (unlike the pole)", () => {
    const [r] = sweep([{ site, mask: flatHorizon() }], Date.UTC(2023, 0, 1), Date.UTC(2024, 0, 1), 3_600_000);
    expect(r.litFraction).toBeGreaterThan(0.45);
    expect(r.litFraction).toBeLessThan(0.55);
  });
});
