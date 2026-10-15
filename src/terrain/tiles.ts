/**
 * NASA Moon Trek WMTS: LRO WAC south-pole mosaic (60°S → pole), MEASURED imagery.
 *   https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/WMTSCapabilities.xml
 *
 * Verified against the capabilities document: PNG, 256 px tiles, top-left corner (−1 095 930, 1 095 930) m
 * in south-polar stereographic metres, zoom 5 = 32×32 tiles of 68 495.6 m. The service allows browser
 * (CORS) requests and needs no key.
 */
export const TILE_BASE = "https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100m_v02/1.0.0/default/default028mm";
export const TILE_ORIGIN_M = 1_095_930;
export const TILE_SOURCE = "LRO WAC Mosaic, S Pole v2 (NASA Moon Trek)";

/** Tile grid for a zoom level (the layer is 2^(z)… tiles wide only across its square footprint). */
export function tileSpanM(zoom: number): number {
  const tilesAcross = 2 ** zoom; // zoom 5 → 32 tiles across the ±1 095 930 m footprint
  return (2 * TILE_ORIGIN_M) / tilesAcross;
}

export const tileUrl = (zoom: number, row: number, col: number): string => `${TILE_BASE}/${zoom}/${row}/${col}.png`;

export interface TileRef {
  zoom: number;
  row: number;
  col: number;
  /** Tile bounds in polar-stereographic metres. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Tiles intersecting the square window ±extentKm/2 around the pole. */
export function tilesForWindow(extentKm: number, zoom: number): TileRef[] {
  const span = tileSpanM(zoom);
  const half = (extentKm * 1000) / 2;
  const c0 = Math.floor((-half + TILE_ORIGIN_M) / span);
  const c1 = Math.floor((half + TILE_ORIGIN_M) / span);
  const r0 = Math.floor((TILE_ORIGIN_M - half) / span);
  const r1 = Math.floor((TILE_ORIGIN_M + half) / span);
  const out: TileRef[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const x0 = -TILE_ORIGIN_M + col * span;
      const y1 = TILE_ORIGIN_M - row * span;
      out.push({ zoom, row, col, x0, x1: x0 + span, y0: y1 - span, y1 });
    }
  }
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export interface ImageryResult {
  canvas: HTMLCanvasElement;
  tilesLoaded: number;
  tilesTotal: number;
}

/**
 * Assemble the window's tiles into one square canvas, row 0 = +y (same layout as the heightmap),
 * so a vertex at heightmap pixel (col,row) samples the texture at the same (col,row).
 * Missing tiles are left transparent-black; the count is reported so the UI can say so.
 */
export async function loadPolarImagery(
  extentKm: number,
  sizePx = 2048,
  zoom = 5,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageryResult> {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, sizePx, sizePx);

  const tiles = tilesForWindow(extentKm, zoom);
  const half = (extentKm * 1000) / 2;
  const toPx = (m: number) => ((m + half) / (extentKm * 1000)) * sizePx;
  let done = 0;
  let loaded = 0;

  const queue = [...tiles];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const img = await loadImage(tileUrl(t.zoom, t.row, t.col));
      if (img) {
        const dx = toPx(t.x0);
        const dy = sizePx - toPx(t.y1); // canvas y grows downward; +y is up
        const dw = toPx(t.x1) - toPx(t.x0);
        ctx.drawImage(img, dx, dy, dw + 0.5, dw + 0.5);
        loaded++;
      }
      onProgress?.(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { canvas, tilesLoaded: loaded, tilesTotal: tiles.length };
}

/**
 * Global LRO WAC mosaic (equirectangular, -180..180 lon, +-90 lat) from NASA Moon Trek.
 * Verified against its capabilities document: JPEG, 256 px tiles, TileMatrix z has 2^(z+1) x 2^z tiles,
 * top-left corner (-180, 90).
 */
export const GLOBAL_TILE_BASE = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm";
export const GLOBAL_TILE_SOURCE = "LRO WAC Mosaic, global (NASA Moon Trek)";

export async function loadGlobalImagery(
  zoom = 3,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageryResult> {
  const cols = 2 ** (zoom + 1);
  const rows = 2 ** zoom;
  const canvas = document.createElement("canvas");
  canvas.width = cols * 256;
  canvas.height = rows * 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const queue: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) queue.push([r, c]);
  const total = queue.length;
  let done = 0;
  let loaded = 0;
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const [r, c] = t;
      const img = await loadImage(`${GLOBAL_TILE_BASE}/${zoom}/${r}/${c}.jpg`);
      if (img) {
        ctx.drawImage(img, c * 256, r * 256, 256, 256);
        loaded++;
      }
      onProgress?.(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return { canvas, tilesLoaded: loaded, tilesTotal: total };
}
