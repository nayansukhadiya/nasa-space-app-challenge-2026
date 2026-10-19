import { type DataLayer, layerTileUrl } from "@/lib/layerCatalog";
import { xyToLatLon } from "./projection";

/** A Moon Trek equirectangular tile grid at zoom z: 2^z rows × 2^(z+1) columns of 256 px, row 0 at +90°, col 0 at −180°. */
export const TILE_PX = 256;
export const gridRows = (z: number): number => 2 ** z;
export const gridCols = (z: number): number => 2 ** (z + 1);

/** The deepest zoom worth using for a purpose, never deeper than the layer offers. */
export const zoomFor = (layer: DataLayer, wanted: number): number => Math.max(0, Math.min(layer.maxZoom, wanted));

/** Tile rows (inclusive) covering [latSouth, latNorth] at zoom z. */
export function tileRowRange(latSouthDeg: number, latNorthDeg: number, z: number): [number, number] {
  const rows = gridRows(z);
  const row = (lat: number) => Math.min(rows - 1, Math.max(0, Math.floor(((90 - lat) / 180) * rows)));
  return [row(latNorthDeg), row(latSouthDeg)];
}

/** Does the layer have data at this point? (Tiles outside the footprint do not exist.) */
export function layerHasData(layer: DataLayer, latDeg: number, lonDeg: number): boolean {
  const [w, s, e, n] = layer.bbox;
  // 0.01° (≈ 300 m) of slack: polar footprints end a hair short of exactly −90°, and the pole itself is inside them.
  const eps = 0.01;
  return latDeg >= s - eps && latDeg <= n + eps && lonDeg >= w - eps && lonDeg <= e + eps;
}

/**
 * For every pixel of a south-polar map (same layout as the heightmap: row 0 = +y, col 0 = −x, `extentKm` square), which
 * source tile and which pixel inside it supplies the colour. Pixels outside the layer's footprint get tile −1.
 * Nearest-neighbour: the data are coarser than the map except at the pole, and nearest keeps NASA's colours exact.
 */
export interface PolarPlan {
  size: number;
  zoom: number;
  /** Tile id (row · cols + col) per output pixel, or −1. */
  tile: Int32Array;
  /** Pixel inside the tile: ty · 256 + tx. */
  inTile: Uint16Array;
  /** Distinct tile ids that are needed. */
  needed: number[];
}

export function planPolar(layer: DataLayer, extentKm: number, size: number, zoom: number): PolarPlan {
  const rows = gridRows(zoom);
  const cols = gridCols(zoom);
  const tile = new Int32Array(size * size).fill(-1);
  const inTile = new Uint16Array(size * size);
  const seen = new Set<number>();
  for (let r = 0; r < size; r++) {
    const y = (0.5 - (r + 0.5) / size) * extentKm;
    for (let c = 0; c < size; c++) {
      const x = ((c + 0.5) / size - 0.5) * extentKm;
      const [lat, lonRaw] = xyToLatLon(x, y);
      const lon = ((lonRaw + 540) % 360) - 180;
      if (!layerHasData(layer, lat, lon)) continue;
      const px = ((lon + 180) / 360) * cols * TILE_PX;
      const py = ((90 - lat) / 180) * rows * TILE_PX;
      const tc = Math.min(cols - 1, Math.floor(px / TILE_PX));
      const tr = Math.min(rows - 1, Math.floor(py / TILE_PX));
      const tx = Math.min(TILE_PX - 1, Math.floor(px - tc * TILE_PX));
      const ty = Math.min(TILE_PX - 1, Math.floor(py - tr * TILE_PX));
      const id = tr * cols + tc;
      const i = r * size + c;
      tile[i] = id;
      inTile[i] = ty * TILE_PX + tx;
      seen.add(id);
    }
  }
  return { size, zoom, tile, inTile, needed: [...seen] };
}

/** Fill an RGBA buffer from decoded tiles (id → 256×256 RGBA). Pixels whose tile is missing stay transparent. */
export function fillFromTiles(plan: PolarPlan, tiles: Map<number, Uint8ClampedArray>, out: Uint8ClampedArray): number {
  let filled = 0;
  for (let i = 0; i < plan.tile.length; i++) {
    const id = plan.tile[i];
    if (id < 0) continue;
    const data = tiles.get(id);
    if (!data) continue;
    const s = plan.inTile[i] * 4;
    const o = i * 4;
    out[o] = data[s];
    out[o + 1] = data[s + 1];
    out[o + 2] = data[s + 2];
    out[o + 3] = data[s + 3];
    if (data[s + 3] > 0) filled++;
  }
  return filled;
}

// ---------------------------------------------------------------- browser I/O

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function pool<T>(items: T[], n: number, task: (t: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let t = queue.shift(); t !== undefined; t = queue.shift()) await task(t);
    }),
  );
}

export interface OverlayResult {
  canvas: HTMLCanvasElement;
  tilesLoaded: number;
  tilesTotal: number;
}

/**
 * The layer over the whole Moon as one 4096 × 2048 equirectangular canvas (transparent where the layer has no data),
 * built from the world tile grid at zoom ≤ 3 so each tile is exactly 256 px.
 */
export async function loadWorldOverlay(
  layer: DataLayer,
  onProgress?: (done: number, total: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<OverlayResult> {
  const z = zoomFor(layer, 3);
  const rows = gridRows(z);
  const cols = gridCols(z);
  const W = 4096;
  const H = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.imageSmoothingEnabled = true;

  const [r0, r1] = tileRowRange(layer.bbox[1], layer.bbox[3], z);
  const jobs: Array<[number, number]> = [];
  for (let r = r0; r <= r1; r++) for (let c = 0; c < cols; c++) jobs.push([r, c]);
  let done = 0;
  let loaded = 0;
  await pool(jobs, 12, async ([r, c]) => {
    if (isCancelled()) return;
    const img = await loadImage(layerTileUrl(layer, z, r, c));
    if (img) {
      const dw = W / cols;
      const dh = H / rows;
      ctx.drawImage(img, c * dw, r * dh, dw + 0.5, dh + 0.5);
      loaded++;
    }
    onProgress?.(++done, jobs.length);
  });
  return { canvas, tilesLoaded: loaded, tilesTotal: jobs.length };
}

/**
 * The layer resampled onto a south-polar map (same layout as the heightmap), fetching only the tiles that map needs.
 * Tiles are decoded one at a time and thrown away, so memory stays small even at zoom 6.
 */
export async function loadPolarOverlay(
  layer: DataLayer,
  extentKm: number,
  size: number,
  zoom: number,
  onProgress?: (done: number, total: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<OverlayResult> {
  const plan = planPolar(layer, extentKm, size, zoom);
  const cols = gridCols(zoom);
  const out = new Uint8ClampedArray(size * size * 4);
  const scratch = document.createElement("canvas");
  scratch.width = TILE_PX;
  scratch.height = TILE_PX;
  const sctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("2D canvas unavailable");

  // decode every needed tile into a map first (bounded by the plan), then fill in one pass
  const decoded = new Map<number, Uint8ClampedArray>();
  let done = 0;
  let loaded = 0;
  await pool(plan.needed, 12, async (id) => {
    if (isCancelled()) return;
    const img = await loadImage(layerTileUrl(layer, zoom, Math.floor(id / cols), id % cols));
    if (img) {
      // draw + read inside one synchronous block so the shared scratch canvas is never interleaved
      sctx.clearRect(0, 0, TILE_PX, TILE_PX);
      sctx.drawImage(img, 0, 0, TILE_PX, TILE_PX);
      decoded.set(id, sctx.getImageData(0, 0, TILE_PX, TILE_PX).data);
      loaded++;
    }
    onProgress?.(++done, plan.needed.length);
  });
  fillFromTiles(plan, decoded, out);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.putImageData(new ImageData(out, size, size), 0, 0);
  return { canvas, tilesLoaded: loaded, tilesTotal: plan.needed.length };
}

/** base + overlay at `opacity`, as a new canvas the size of the base. The base is never modified. */
export function blendOverlay(base: HTMLCanvasElement, overlay: HTMLCanvasElement | null, opacity: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d");
  if (!ctx) return base;
  ctx.drawImage(base, 0, 0);
  if (overlay) {
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(overlay, 0, 0, base.width, base.height);
  }
  return c;
}
