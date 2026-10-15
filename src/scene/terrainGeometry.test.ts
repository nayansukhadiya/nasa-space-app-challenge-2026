import { describe, expect, it } from "vitest";
import { MOON_RADIUS_KM } from "@/astro/constants";
import { latLonToXY } from "@/terrain/projection";
import { makeSyntheticHeightmap } from "@/terrain/synthetic";
import { sceneToLatLon, surfacePoint } from "./frame";
import { buildTerrainGeometry } from "./terrainGeometry";

describe("terrain geometry", () => {
  it("vertices agree with the closed-form surface point for the same lat/lon", () => {
    const map = makeSyntheticHeightmap(64, 200, []);
    const geo = buildTerrainGeometry(map, 1, 1);
    const pos = geo.getAttribute("position");
    // Pick the vertex nearest to 88°S, 30°E and compare to surfacePoint().
    const [tx, ty] = latLonToXY(-88, 30);
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < pos.count; k++) {
      const col = k % 64;
      const row = Math.floor(k / 64);
      const x = (col + 0.5) * map.pixelKm - map.halfKm;
      const y = map.halfKm - (row + 0.5) * map.pixelKm;
      const d = Math.hypot(x - tx, y - ty);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    // Reconstruct the exact lat/lon of that vertex and compare.
    const col = best % 64;
    const row = Math.floor(best / 64);
    const x = (col + 0.5) * map.pixelKm - map.halfKm;
    const y = map.halfKm - (row + 0.5) * map.pixelKm;
    const rho = Math.hypot(x, y);
    const lat = (2 * Math.atan(rho / (2 * MOON_RADIUS_KM)) - Math.PI / 2) * (180 / Math.PI);
    const lon = Math.atan2(x, y) * (180 / Math.PI);
    const expected = surfacePoint(lat, lon, 0, 1);
    expect(pos.getX(best)).toBeCloseTo(expected[0], 4);
    expect(pos.getY(best)).toBeCloseTo(expected[1], 4);
    expect(pos.getZ(best)).toBeCloseTo(expected[2], 4);
  });

  it("normals point up (+Y) and the pole region is the highest part of the sphere cap", () => {
    const map = makeSyntheticHeightmap(65, 100, []);
    const geo = buildTerrainGeometry(map, 1, 1);
    const nrm = geo.getAttribute("normal");
    const pos = geo.getAttribute("position");
    let minNy = 1;
    let maxY = -Infinity;
    for (let k = 0; k < nrm.count; k++) {
      minNy = Math.min(minNy, nrm.getY(k));
      maxY = Math.max(maxY, pos.getY(k));
    }
    expect(minNy).toBeGreaterThan(0.99); // 50 km from the pole: tilt < 2°
    expect(Math.abs(maxY)).toBeLessThan(0.01); // pole at the origin
  });

  it("sceneToLatLon inverts surfacePoint, including height and exaggeration", () => {
    for (const [lat, lon, h, k] of [
      [-90, 0, 0, 1],
      [-85.9, 2.9, 4.7, 1],
      [-84.9, -35.5, -2.8, 5],
      [-82, 170, 1.3, 3],
    ] as const) {
      const p = surfacePoint(lat, lon, h, k);
      const [la, lo] = sceneToLatLon(p[0], p[1], p[2]);
      expect(la).toBeCloseTo(lat, 8);
      if (lat > -90) expect(lo).toBeCloseTo(lon, 8);
    }
  });

  it("a hole removes only cells fully inside it, and a drop moves vertices down along local up", () => {
    const map = makeSyntheticHeightmap(65, 130, []);
    const full = buildTerrainGeometry(map, 1, 1);
    const holed = buildTerrainGeometry(map, 1, 1, 40);
    expect(holed.getIndex()!.count).toBeLessThan(full.getIndex()!.count);
    // cells in the hole area are gone (≈ (80/2)² cells × 6 indices), the ring around it stays
    const removed = (full.getIndex()!.count - holed.getIndex()!.count) / 6;
    expect(removed).toBeGreaterThan(30 * 30);
    expect(removed).toBeLessThan(42 * 42);

    const dropped = buildTerrainGeometry(map, 1, 1, 0, 0.5);
    // the pole-most vertex moves 0.5 km straight down (−Y at the pole)
    const k = Math.floor(65 / 2) * 65 + Math.floor(65 / 2);
    expect(full.getAttribute("position").getY(k) - dropped.getAttribute("position").getY(k)).toBeCloseTo(0.5, 1);
  });
});
