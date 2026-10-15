import { describe, expect, it } from "vitest";
import { MOON_RADIUS_KM, RAD } from "./constants";
import { flatHorizon } from "./horizon";
import {
  MU_MOON,
  RELAY_PRESETS,
  inertialPosition,
  orbitPeriodS,
  relayPositionFixed,
  relayWindows,
  segmentHitsMoon,
  solveKepler,
} from "./relay";
import { norm } from "./vec";

const circ = RELAY_PRESETS[0];
const ell12 = RELAY_PRESETS[1];

describe("Kepler solver", () => {
  it("satisfies M = E − e·sin E across eccentricities and anomalies", () => {
    for (const e of [0, 0.1, 0.5, 0.64, 0.9, 0.98]) {
      for (let M = 0; M < 2 * Math.PI; M += 0.37) {
        const E = solveKepler(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
      }
    }
  });
});

describe("orbit propagation", () => {
  it("period matches 2π√(a³/μ) and the inertial position repeats after one period", () => {
    for (const o of [circ, ell12]) {
      const T = orbitPeriodS(o);
      const p0 = inertialPosition(o, o.epochMs);
      const p1 = inertialPosition(o, o.epochMs + T * 1000);
      expect(norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]])).toBeLessThan(1e-3);
    }
    expect(orbitPeriodS(ell12) / 3600).toBeCloseTo(12, 6);
    expect(orbitPeriodS(circ) / 3600).toBeCloseTo((2 * Math.PI * Math.sqrt((MOON_RADIUS_KM + 500) ** 3 / MU_MOON)) / 3600, 9);
  });

  it("circular orbit keeps constant radius = a; elliptical stays between periapsis and apoapsis", () => {
    for (let t = 0; t < 8000; t += 200) {
      expect(norm(inertialPosition(circ, circ.epochMs + t * 1000))).toBeCloseTo(circ.aKm, 6);
    }
    let lo = Infinity;
    let hi = 0;
    for (let t = 0; t < 12 * 3600; t += 60) {
      const r = norm(inertialPosition(ell12, ell12.epochMs + t * 1000));
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect(lo).toBeCloseTo(MOON_RADIUS_KM + 500, 0);
    expect(hi).toBeCloseTo(ell12.aKm * (1 + ell12.e), 0);
  });

  it("a polar orbit reaches latitude ±90° and the 12 h orbit starts at apoapsis over the south pole", () => {
    let maxLat = 0;
    for (let t = 0; t < 9500; t += 20) {
      const p = relayPositionFixed(circ, circ.epochMs + t * 1000);
      maxLat = Math.max(maxLat, Math.abs(Math.asin(p[2] / norm(p)) * RAD));
    }
    expect(maxLat).toBeGreaterThan(89.5);

    const p = relayPositionFixed(ell12, ell12.epochMs);
    expect(Math.asin(p[2] / norm(p)) * RAD).toBeCloseTo(-90, 3);
    expect(norm(p)).toBeCloseTo(ell12.aKm * (1 + ell12.e), 3);
  });
});

describe("Moon occlusion", () => {
  it("blocks a path through the Moon and allows one that clears it", () => {
    expect(segmentHitsMoon([2000, 0, 0], [-384_400, 0, 0])).toBe(true);
    expect(segmentHitsMoon([2000, 0, 0], [384_400, 0, 0])).toBe(false);
    expect(segmentHitsMoon([0, 0, -10_000], [0, 0, 10_000], MOON_RADIUS_KM)).toBe(true);
    expect(segmentHitsMoon([1800, 5000, 0], [1800, -5000, 0], MOON_RADIUS_KM)).toBe(false); // passes 1800 km out
  });
});

describe("pass windows over the pole", () => {
  it("an apoapsis-over-the-south orbit is seen from the pole far more than a low circular one", () => {
    const site = { id: "pole", name: "Pole", latDeg: -90, lonDeg: 0 };
    const start = Date.UTC(2026, 10, 14);
    const day = 86_400_000;
    const low = relayWindows(circ, site, flatHorizon(), start, start + day, 60_000);
    const high = relayWindows(ell12, site, flatHorizon(), start, start + day, 60_000);
    expect(high.siteSeesRelay.length).toBeGreaterThan(0);
    // fraction of time a satellite is above the pole's horizon
    const frac = (w: Array<[number, number]>) => w.reduce((s, [a, b]) => s + (b - a), 0) / day;
    expect(frac(high.siteSeesRelay)).toBeGreaterThan(frac(low.siteSeesRelay));
    // A polar circular orbit crosses the pole once per revolution and is above the pole's horizon
    // while within acos(R/a) of arc on each side: analytic fraction = 2·acos(R/a)/360°.
    const analytic = (2 * Math.acos(MOON_RADIUS_KM / circ.aKm)) / (2 * Math.PI);
    expect(frac(low.siteSeesRelay)).toBeCloseTo(analytic, 2);
    // combined coverage can never be lower than either path alone
    for (const w of [low, high]) {
      expect(w.anyFraction).toBeGreaterThanOrEqual(Math.max(w.directFraction, w.linkedFraction) - 1e-12);
    }
  });
});
