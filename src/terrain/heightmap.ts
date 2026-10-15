import { MOON_RADIUS_KM } from "@/astro/constants";
import { latLonToXY } from "./projection";

/**
 * Sidecar JSON for heightmap.bin, written by pipeline/dem.py.
 * The binary is `size × size` little-endian Float32, heights in km above the
 * reference sphere. Row 0 is the +y edge; pixel (col,row) centre sits at
 *   x = (col + 0.5) · pixelKm − extentKm/2,   y = extentKm/2 − (row + 0.5) · pixelKm
 */
export interface HeightmapMeta {
  version: 1;
  size: number;
  /** Full width of the square map, km, in south-polar stereographic coordinates. */
  extentKm: number;
  radiusKm: number;
  minKm: number;
  maxKm: number;
  /** Provenance, e.g. the LOLA product id. Shown in the UI as the MEASURED source. */
  source: string;
  synthetic?: boolean;
}

/** Anything the horizon marcher and scene helpers can sample heights from. */
export interface HeightSource {
  readonly radiusKm: number;
  /** Finest pixel size, km (sets the minimum ray-march step). */
  readonly pixelKm: number;
  /** Half-width of the area covered, km from the pole. */
  readonly halfKm: number;
  /** Height above the reference sphere (km) at a lat/lon, NaN where no data. */
  heightAtLatLon(latDeg: number, lonDeg: number): number;
}

export class Heightmap implements HeightSource {
  readonly pixelKm: number;
  readonly halfKm: number;

  constructor(
    readonly meta: HeightmapMeta,
    readonly data: Float32Array,
  ) {
    if (data.length !== meta.size * meta.size) {
      throw new Error(`heightmap size mismatch: ${data.length} samples for ${meta.size}²`);
    }
    this.pixelKm = meta.extentKm / meta.size;
    this.halfKm = meta.extentKm / 2;
  }

  get radiusKm(): number {
    return this.meta.radiusKm ?? MOON_RADIUS_KM;
  }

  /** Bilinear height (km above the reference sphere) at polar-stereographic x,y km; NaN outside the map. */
  heightAtXY(x: number, y: number): number {
    const { size } = this.meta;
    const fc = (x + this.halfKm) / this.pixelKm - 0.5;
    const fr = (this.halfKm - y) / this.pixelKm - 0.5;
    if (fc < 0 || fr < 0 || fc > size - 1 || fr > size - 1) return Number.NaN;
    const c0 = Math.floor(fc);
    const r0 = Math.floor(fr);
    const c1 = Math.min(c0 + 1, size - 1);
    const r1 = Math.min(r0 + 1, size - 1);
    const tx = fc - c0;
    const ty = fr - r0;
    const d = this.data;
    const top = d[r0 * size + c0] * (1 - tx) + d[r0 * size + c1] * tx;
    const bot = d[r1 * size + c0] * (1 - tx) + d[r1 * size + c1] * tx;
    return top * (1 - ty) + bot * ty;
  }

  heightAtLatLon(latDeg: number, lonDeg: number): number {
    const [x, y] = latLonToXY(latDeg, lonDeg, this.radiusKm);
    return this.heightAtXY(x, y);
  }
}

export interface GlobalMeta {
  version: 1;
  width: number;
  height: number;
  radiusKm: number;
  minKm: number;
  maxKm: number;
  source: string;
}

/**
 * Whole-Moon equirectangular grid (LOLA LDEM_4, 4 px/deg, about 7.6 km). Line 0 is +90 deg latitude,
 * sample 0 is 0 deg longitude, longitude increases east and wraps at 360. Heights in km above the sphere.
 */
export class GlobalHeightmap {
  constructor(
    readonly meta: GlobalMeta,
    readonly data: Float32Array,
  ) {
    if (data.length !== meta.width * meta.height) throw new Error("global heightmap size mismatch");
  }
  get radiusKm(): number {
    return this.meta.radiusKm;
  }
  /** Bilinear height at any lat/lon (longitude wraps). */
  heightAtLatLon(latDeg: number, lonDeg: number): number {
    const { width: w, height: h } = this.meta;
    const fx = ((((lonDeg % 360) + 360) % 360) / 360) * w - 0.5;
    const fy = Math.min(Math.max(((90 - latDeg) / 180) * h - 0.5, 0), h - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const xa = ((x0 % w) + w) % w;
    const xb = (xa + 1) % w;
    const y1 = Math.min(y0 + 1, h - 1);
    const d = this.data;
    const top = d[y0 * w + xa] * (1 - tx) + d[y0 * w + xb] * tx;
    const bot = d[y1 * w + xa] * (1 - tx) + d[y1 * w + xb] * tx;
    return top * (1 - ty) + bot * ty;
  }
}

export async function loadGlobalHeightmap(baseUrl = "/data"): Promise<GlobalHeightmap | null> {
  try {
    const m = await fetch(`${baseUrl}/heightmap-global.meta.json`);
    if (!m.ok) return null;
    const meta = (await m.json()) as GlobalMeta;
    const b = await fetch(`${baseUrl}/heightmap-global.bin`);
    if (!b.ok) return null;
    return new GlobalHeightmap(meta, new Float32Array(await b.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * Detailed map where it exists, otherwise the wider, coarser one. Rays can start in the detailed
 * window and keep going over the wide map, so far terrain is never cut off at the detail edge.
 */
export class CompositeHeightmap implements HeightSource {
  constructor(
    readonly detail: Heightmap,
    readonly wide: Heightmap | null,
    readonly global: GlobalHeightmap | null = null,
  ) {}
  get radiusKm(): number {
    return this.detail.radiusKm;
  }
  get pixelKm(): number {
    return this.detail.pixelKm;
  }
  get halfKm(): number {
    return Math.max(this.detail.halfKm, this.wide?.halfKm ?? 0);
  }
  heightAtLatLon(latDeg: number, lonDeg: number): number {
    const h = this.detail.heightAtLatLon(latDeg, lonDeg);
    if (!Number.isNaN(h)) return h;
    const w = this.wide ? this.wide.heightAtLatLon(latDeg, lonDeg) : Number.NaN;
    if (!Number.isNaN(w)) return w;
    return this.global ? this.global.heightAtLatLon(latDeg, lonDeg) : Number.NaN;
  }

  /** Which dataset answers at a point, for honest resolution labelling. */
  sourceAt(latDeg: number, lonDeg: number): "detail" | "wide" | "global" | "none" {
    if (!Number.isNaN(this.detail.heightAtLatLon(latDeg, lonDeg))) return "detail";
    if (this.wide && !Number.isNaN(this.wide.heightAtLatLon(latDeg, lonDeg))) return "wide";
    return this.global ? "global" : "none";
  }
}

export async function loadHeightmap(baseUrl = "/data", stem = "heightmap"): Promise<Heightmap | null> {
  try {
    const metaRes = await fetch(`${baseUrl}/${stem}.meta.json`);
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as HeightmapMeta;
    const binRes = await fetch(`${baseUrl}/${stem}.bin`);
    if (!binRes.ok) return null;
    return new Heightmap(meta, new Float32Array(await binRes.arrayBuffer()));
  } catch {
    return null;
  }
}
