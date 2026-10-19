import { describe, expect, it } from "vitest";
import { flatHorizon } from "./horizon";
import type { Site } from "./site";
import { moonState } from "./frames";
import { computeTimeline, nextSunEvent } from "./timeline";
import { dsnStatus, sunStatus } from "./visibility";

const site: Site = { id: "t", name: "Test", latDeg: 0, lonDeg: 0 };
const T0 = Date.UTC(2025, 2, 13, 12, 0);
const HOUR = 3_600_000;

describe("timeline series", () => {
  const d = computeTimeline(site, flatHorizon(), flatHorizon(), T0, 3 * 24 * HOUR, 20 * 60_000);
  it("has one sample per step and matches the point calculators exactly", () => {
    expect(d.n).toBe(216);
    for (const i of [0, 57, 140, 215]) {
      const st = moonState(new Date(T0 + i * d.stepMs));
      const sun = sunStatus(st, site, flatHorizon());
      expect(d.sunEl[i]).toBeCloseTo(sun.elDeg, 4);
      expect(d.light[i]).toBeCloseTo(sun.fraction, 5);
      expect(d.dsn[i]).toBe(dsnStatus(st, site, flatHorizon()).linked ? 1 : 0);
    }
  });
  it("sees the 14 March 2025 lunar eclipse as one contiguous block with the light going to ~0", () => {
    const idx = [...d.eclipse].map((c, i) => (c > 0.01 ? i : -1)).filter((i) => i >= 0);
    expect(idx.length).toBeGreaterThan(6); // > 2 h at 20 min
    expect(idx[idx.length - 1] - idx[0] + 1).toBe(idx.length); // contiguous
    const mid = idx[Math.floor(idx.length / 2)];
    expect(d.light[mid]).toBeLessThan(0.05);
  });
  it("noon-to-noon at the sub-Earth point shows a day-night cycle in the Sun elevation", () => {
    expect(Math.max(...d.sunEl)).toBeGreaterThan(30);
  });
});

describe("next sunrise / sunset", () => {
  it("returns the next change of state and it is in the future", () => {
    const e = nextSunEvent(site, flatHorizon(), T0);
    expect(e).not.toBeNull();
    expect(e!.atMs).toBeGreaterThan(T0);
    const before = sunStatus(moonState(new Date(e!.atMs - 30 * 60_000)), site, flatHorizon());
    const after = sunStatus(moonState(new Date(e!.atMs + 30 * 60_000)), site, flatHorizon());
    if (e!.kind === "sunrise") {
      expect(before.lit).toBe(false);
      expect(after.lit).toBe(true);
    } else {
      expect(before.lit).toBe(true);
      expect(after.lit).toBe(false);
    }
  });
  it("is null when nothing changes (a wall the Sun can never clear)", () => {
    expect(nextSunEvent(site, new Float32Array(1440).fill(120), T0, 10)).toBeNull();
  });
});
