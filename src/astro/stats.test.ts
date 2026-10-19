import { describe, expect, it } from "vitest";
import { diskGrid, offsetLatLon, percentile, spread } from "./stats";

describe("percentiles", () => {
  it("matches the NumPy 'linear' definition", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 10)).toBeCloseTo(1.4, 12);
    expect(percentile([1, 2, 3, 4, 5], 90)).toBeCloseTo(4.6, 12);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNaN();
  });
  it("spread orders P10 ≤ P50 ≤ P90 inside [min, max], and does not mutate its input", () => {
    const v = [0.9, 0.1, 0.5, 0.7, 0.3, 0.95, 0.02];
    const copy = [...v];
    const s = spread(v);
    expect(v).toEqual(copy);
    expect(s.min).toBe(0.02);
    expect(s.max).toBe(0.95);
    expect(s.min).toBeLessThanOrEqual(s.p10);
    expect(s.p10).toBeLessThanOrEqual(s.p50);
    expect(s.p50).toBeLessThanOrEqual(s.p90);
    expect(s.p90).toBeLessThanOrEqual(s.max);
  });
});

describe("landing-region grid", () => {
  it("includes the centre once and keeps every point inside the disc", () => {
    const g = diskGrid(5, 1);
    expect(g.filter((p) => p.eastKm === 0 && p.northKm === 0)).toHaveLength(1);
    for (const p of g) expect(Math.hypot(p.eastKm, p.northKm)).toBeLessThanOrEqual(5 + 1e-9);
    // ≈ πr² points for a unit grid
    expect(g.length).toBeGreaterThan(70);
    expect(g.length).toBeLessThan(90);
  });
  it("offsetLatLon moves the right distance in the right direction", () => {
    const [lat, lon] = offsetLatLon(-85, 10, 0, 10); // 10 km north
    expect(lat).toBeGreaterThan(-85);
    expect(lon).toBeCloseTo(10, 6);
    expect(((lat + 85) * Math.PI * 1737.4) / 180).toBeCloseTo(10, 3);
    const [, lonE] = offsetLatLon(0, 0, 10, 0); // 10 km east on the equator
    expect((lonE * Math.PI * 1737.4) / 180).toBeCloseTo(10, 3);
  });
});
