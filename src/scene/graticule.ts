import type { HeightSource } from "@/terrain/heightmap";
import { xyToLatLon } from "@/terrain/projection";
import type { GridMode } from "@/store/sim";
import { surfacePoint } from "./frame";

export interface GridLabel {
  text: string;
  pos: [number, number, number];
}

const LIFT_KM = 0.35; // keep lines clear of the surface so they never z-fight with it

function pointAt(map: HeightSource, latDeg: number, lonDeg: number, k: number): [number, number, number] | null {
  const h = map.heightAtLatLon(latDeg, lonDeg);
  if (Number.isNaN(h)) return null;
  const p = surfacePoint(latDeg, lonDeg, h + LIFT_KM / k, k);
  return [p[0], p[1], p[2]];
}

/** Push a polyline (already-sampled points, nulls break it) as line segments. */
function addPolyline(out: number[], pts: Array<[number, number, number] | null>): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a && b) out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
}

const lonLabel = (lon: number): string => {
  const l = ((lon + 540) % 360) - 180;
  if (l === 0) return "0°";
  if (Math.abs(l) === 180) return "180°";
  return `${Math.abs(l)}°${l > 0 ? "E" : "W"}`;
};

/**
 * Lat/lon graticule (rings every 2° of latitude, spokes every 30° of longitude) or a square km grid
 * (every 50 km, in polar-stereographic x/y). Lines follow the DEM surface.
 */
export function buildGrid(map: HeightSource, mode: GridMode, k: number): { segments: Float32Array; labels: GridLabel[] } {
  const out: number[] = [];
  const labels: GridLabel[] = [];
  if (mode === "off") return { segments: new Float32Array(0), labels };

  const half = map.halfKm;
  const R = map.radiusKm;

  if (mode === "latlon") {
    // Polar rings (close together near the pole, labelled on the 135°E meridian)
    for (const lat of [-62, -65, -70, -75, -80, -82, -84, -86, -88]) {
      const pts: Array<[number, number, number] | null> = [];
      for (let lon = -180; lon <= 180; lon += 1) pts.push(pointAt(map, lat, lon, k));
      addPolyline(out, pts);
      const p = pointAt(map, lat, 135, k);
      if (p) labels.push({ text: `${Math.abs(lat)}°S`, pos: p });
    }
    // Whole-Moon rings every 30° (60°S is already above), labelled on the 15°E meridian
    for (const lat of [-30, 0, 30, 60]) {
      const pts: Array<[number, number, number] | null> = [];
      for (let lon = -180; lon <= 180; lon += 1) pts.push(pointAt(map, lat, lon, k));
      addPolyline(out, pts);
      const p = pointAt(map, lat, 15, k);
      if (p) labels.push({ text: lat === 0 ? "EQUATOR" : `${Math.abs(lat)}°${lat < 0 ? "S" : "N"}`, pos: p });
    }
    const p60 = pointAt(map, -60, 15, k);
    if (p60) labels.push({ text: "60°S", pos: p60 });
    // Meridians pole to pole every 30°; polar longitude labels near the pole, equatorial ones every 60°
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: Array<[number, number, number] | null> = [];
      for (let lat = -90; lat <= 90; lat += 0.5) pts.push(pointAt(map, lat, lon, k));
      addPolyline(out, pts);
      const p = pointAt(map, -83, lon, k);
      if (p) labels.push({ text: lonLabel(lon), pos: p });
      if (lon % 60 === 0) {
        const q = pointAt(map, 0, lon, k);
        if (q) labels.push({ text: lonLabel(lon), pos: q });
      }
    }
  } else {
    const step = 50;
    const n = Math.floor(half / step);
    const labelEvery = half > 400 ? 4 : 2;
    for (let i = -n; i <= n; i++) {
      const vx: Array<[number, number, number] | null> = [];
      const vy: Array<[number, number, number] | null> = [];
      for (let t = -half + 1; t <= half - 1; t += 6) {
        const [la1, lo1] = xyToLatLon(i * step, t, R);
        const [la2, lo2] = xyToLatLon(t, i * step, R);
        vx.push(pointAt(map, la1, lo1, k));
        vy.push(pointAt(map, la2, lo2, k));
      }
      addPolyline(out, vx);
      addPolyline(out, vy);
      if (i % labelEvery === 0 && i !== 0) {
        const [la1, lo1] = xyToLatLon(i * step, -half + 14, R);
        const [la2, lo2] = xyToLatLon(-half + 14, i * step, R);
        const a = pointAt(map, la1, lo1, k);
        const b = pointAt(map, la2, lo2, k);
        if (a) labels.push({ text: `x ${i * step > 0 ? "+" : ""}${i * step} km`, pos: a });
        if (b) labels.push({ text: `y ${i * step > 0 ? "+" : ""}${i * step} km`, pos: b });
      }
    }
  }
  return { segments: new Float32Array(out), labels };
}
