import { describe, expect, it } from "vitest";
import { MOON_RADIUS_KM, RAD } from "@/astro/constants";
import { HORIZON_STEP_DEG, horizonElevationDeg, skyViewFactor } from "@/astro/horizon";
import { CompositeHeightmap } from "./heightmap";
import { computeHorizon } from "./horizonCompute";
import { latLonToXY, xyToLatLon } from "./projection";
import { hillAt, makeSyntheticHeightmap } from "./synthetic";

describe("polar stereographic projection", () => {
  it("round-trips lat/lon", () => {
    for (const [lat, lon] of [
      [-89.9, 12],
      [-85, 0],
      [-80.5, 170],
      [-82, -120],
      [-84.8, 29.2],
    ] as const) {
      const [x, y] = latLonToXY(lat, lon);
      const [la, lo] = xyToLatLon(x, y);
      expect(la).toBeCloseTo(lat, 9);
      expect(lo).toBeCloseTo(lon, 9);
    }
  });

  it("places the pole at the origin and 80°S about 304 km away", () => {
    expect(latLonToXY(-90, 0)).toEqual([expect.closeTo(0, 9), expect.closeTo(0, 9)]);
    const [x, y] = latLonToXY(-80, 0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(2 * MOON_RADIUS_KM * Math.tan(5 * (Math.PI / 180)), 6);
    expect(y).toBeGreaterThan(300);
    expect(y).toBeLessThan(308);
  });

  it("puts 90°E on +x and 0° on +y", () => {
    const [x90, y90] = latLonToXY(-85, 90);
    expect(x90).toBeGreaterThan(0);
    expect(Math.abs(y90)).toBeLessThan(1e-9);
    const [, y0] = latLonToXY(-85, 0);
    expect(y0).toBeGreaterThan(0);
  });
});

describe("horizon mask", () => {
  it("is ~0° everywhere over featureless terrain (curvature drops the ground away)", () => {
    const map = makeSyntheticHeightmap(256, 400, []);
    const mask = computeHorizon(map, -88, 40);
    for (let i = 0; i < mask.length; i += 29) {
      expect(mask[i]).toBeLessThanOrEqual(0.0001);
      expect(mask[i]).toBeGreaterThan(-0.05);
    }
  });

  it("reports a wall in the right direction (azimuth 0 = north, clockwise)", () => {
    const map = makeSyntheticHeightmap(512, 400, [hillAt(-84.5, 0, 3, 3)]);
    // Site at 85°S, 0°E; the hill is ~29 km away, due along the 0° meridian.
    // Moving toward higher latitude (lat -84.5) along lon 0 is a NORTH bearing.
    const mask = computeHorizon(map, -85, 0);
    const north = horizonElevationDeg(mask, 0);
    const south = horizonElevationDeg(mask, 180);
    const east = horizonElevationDeg(mask, 90);
    expect(north).toBeGreaterThan(3);
    expect(south).toBeLessThan(0.01);
    expect(east).toBeLessThan(north / 3);
    // peak azimuth is within a couple of degrees of north
    let peak = 0;
    for (let a = 1; a < mask.length; a++) if (mask[a] > mask[peak]) peak = a;
    const offDeg = (Math.min(peak, mask.length - peak) * 360) / mask.length;
    expect(offDeg).toBeLessThanOrEqual(2);
  });

  it("matches the analytic elevation of a single peak on a sphere", () => {
    // Peak: height H, distance s (arc along the surface). Site on the datum.
    // Elevation = atan2((R+H)·cos(s/R) − R, (R+H)·sin(s/R)).
    const H = 2;
    const sigma = 1.5;
    const site = { lat: -85, lon: 0 };
    const hill = { lat: -84, lon: 0 }; // 1° of latitude ≈ 30.3 km due north
    const map = makeSyntheticHeightmap(1024, 400, [hillAt(hill.lat, hill.lon, H, sigma)]);
    const mask = computeHorizon(map, site.lat, site.lon, { stepKm: 0.1 });

    const R = MOON_RADIUS_KM;
    const s = (Math.abs(hill.lat - site.lat) * Math.PI * R) / 180; // along a meridian
    const centre = Math.atan2((R + H) * Math.cos(s / R) - R, (R + H) * Math.sin(s / R)) * RAD;
    // The Gaussian's skyline peaks ~σ²/s ≈ 0.07 km nearer than its centre, so the
    // computed maximum can only sit at or fractionally above the centre-line value.
    // Sampling a 1.5 km Gaussian on 0.39 km pixels shaves ~1–2 % off its peak, hence
    // the lower bound of -0.1° (≈3 % of 3.27°).
    const max = Math.max(...mask);
    expect(centre).toBeGreaterThan(3); // the peak really is above the horizon
    expect(max).toBeGreaterThanOrEqual(centre - 0.1);
    expect(max).toBeLessThan(centre + 0.15);
    expect(mask[0]).toBeCloseTo(max, 1); // and it is due north
  });

  it("samples the sky every 0.25° (1,440 bins), finer than the Sun's 0.53° disc", () => {
    const map = makeSyntheticHeightmap(256, 400, []);
    const mask = computeHorizon(map, -88, 40);
    expect(mask.length).toBe(1440);
    expect(HORIZON_STEP_DEG).toBe(0.25);
    expect(HORIZON_STEP_DEG).toBeLessThan(0.53 / 2);
  });

  it("interpolates between bins and wraps at 360°, for any mask length", () => {
    const m = new Float32Array(1440);
    m[1439] = 4;
    m[0] = 2;
    expect(horizonElevationDeg(m, 359.875)).toBeCloseTo(3, 6); // half-way between bin 1439 and bin 0
    expect(horizonElevationDeg(m, -0.125)).toBeCloseTo(3, 6);
    const legacy = new Float32Array(360);
    legacy[10] = 1;
    expect(horizonElevationDeg(legacy, 10)).toBeCloseTo(1, 6);
    expect(horizonElevationDeg(legacy, 10.5)).toBeCloseTo(0.5, 6);
  });

  it("sky-view factor is 1 on a plain and falls as the rim rises", () => {
    expect(skyViewFactor(new Float32Array(1440))).toBeCloseTo(1, 12);
    expect(skyViewFactor(new Float32Array(1440).fill(30))).toBeCloseTo(0.5, 6); // 1 − sin 30°
    expect(skyViewFactor(new Float32Array(1440).fill(90))).toBeCloseTo(0, 12);
  });

  it("throws when the site is outside the map", () => {
    const map = makeSyntheticHeightmap(64, 100, []);
    expect(() => computeHorizon(map, -80, 0)).toThrow(/outside/);
  });
});

describe("composite heightmap", () => {
  it("uses the detailed map where it has data and the wide map beyond", () => {
    const detail = makeSyntheticHeightmap(64, 100, [hillAt(-90, 0, 1, 20)]);
    const wide = makeSyntheticHeightmap(64, 400, [hillAt(-90, 0, 3, 20)]);
    const comp = new CompositeHeightmap(detail, wide);
    // near the pole both exist: the detailed value wins
    expect(comp.heightAtLatLon(-90, 0)).toBeCloseTo(detail.heightAtLatLon(-90, 0), 9);
    expect(comp.heightAtLatLon(-90, 0)).toBeLessThan(1.1); // the detail hill is 1 km; the wide one would be ~3 km
    // ~150 km out: outside the 100 km detail square, inside the 400 km wide square
    const [lat, lon] = [-87.5, 40];
    expect(Number.isNaN(detail.heightAtLatLon(lat, lon))).toBe(true);
    expect(comp.heightAtLatLon(lat, lon)).toBeCloseTo(wide.heightAtLatLon(lat, lon), 9);
    // outside both
    expect(Number.isNaN(comp.heightAtLatLon(-80, 40))).toBe(true);
    expect(comp.halfKm).toBe(200);
  });

  it("horizon rays keep going over the wide map past the detail edge", () => {
    // A hill ~120 km from the site: invisible to a detail-only map (100 km wide), seen via the composite.
    const detail = makeSyntheticHeightmap(128, 100, []);
    const wide = makeSyntheticHeightmap(256, 600, [hillAt(-88, 0, 6, 4)]);
    const site = { lat: -89.9, lon: 0 };
    const detailOnly = computeHorizon(detail, site.lat, site.lon);
    const comp = computeHorizon(new CompositeHeightmap(detail, wide), site.lat, site.lon);
    const peak = (m: Float32Array) => Math.max(...m);
    expect(peak(comp)).toBeGreaterThan(peak(detailOnly) + 1);
  });
});

