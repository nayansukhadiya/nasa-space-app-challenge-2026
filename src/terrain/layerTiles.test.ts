import { describe, expect, it } from "vitest";
import { DATA_LAYERS, coversSouth, layerById, layerTileUrl } from "@/lib/layerCatalog";
import { fillFromTiles, gridCols, gridRows, layerHasData, planPolar, tileRowRange, zoomFor } from "./layerTiles";

const layer = (id: string) => {
  const l = layerById(id);
  if (!l) throw new Error(`missing layer ${id}`);
  return l;
};

describe("layer catalog", () => {
  it("has unique ids, sensible footprints and zooms, and a unit only where the source states one", () => {
    const ids = new Set(DATA_LAYERS.map((l) => l.id));
    expect(ids.size).toBe(DATA_LAYERS.length);
    expect(DATA_LAYERS.length).toBeGreaterThanOrEqual(35);
    for (const l of DATA_LAYERS) {
      expect(l.maxZoom).toBeGreaterThanOrEqual(0);
      const [w, s, e, n] = l.bbox;
      expect(w).toBeGreaterThanOrEqual(-180);
      expect(e).toBeLessThanOrEqual(180);
      expect(s).toBeLessThan(n);
      expect(["png", "jpg"]).toContain(l.ext);
      expect(l.blurb.length).toBeGreaterThan(30);
    }
  });
  it("builds the documented WMTS tile url", () => {
    expect(layerTileUrl(layer("LRO_WAC_Mosaic_Global_303ppd_v02"), 3, 4, 5)).toBe(
      "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/3/4/5.jpg",
    );
  });
  it("knows which layers reach the south pole", () => {
    expect(coversSouth(layer("LRO_LOLA_Illumination_SPole65S_240m_EQ"))).toBe(true);
    expect(coversSouth(layer("diviner_Clrtbol_min"))).toBe(true);
    expect(coversSouth(layer("LRO_Diviner_ST_Avg_Clr_Global_32ppd"))).toBe(false); // ±60° only
    expect(coversSouth(layer("3He_Most_Likely_Layer"))).toBe(false); // ±50° only
  });
});

describe("tile grid maths", () => {
  it("zoom z has 2^z rows and 2^(z+1) columns, and row ranges follow latitude", () => {
    expect(gridRows(3)).toBe(8);
    expect(gridCols(3)).toBe(16);
    expect(tileRowRange(-90, 90, 3)).toEqual([0, 7]);
    expect(tileRowRange(-90, -84, 6)).toEqual([61, 63]); // -84° is inside row 61 (2.8° rows)
    expect(tileRowRange(-60, 60, 1)).toEqual([0, 1]);
  });
  it("never asks for a zoom the layer does not have", () => {
    expect(zoomFor(layer("LP_NS_H_Clr_Global_2ppd"), 6)).toBe(1);
    expect(zoomFor(layer("LRO_LOLA_ClrShade_Global_256ppd_v06"), 3)).toBe(3);
  });
  it("footprint test respects latitude and longitude", () => {
    const d = layer("diviner_Clrtbol_min");
    expect(layerHasData(d, -89, 10)).toBe(true);
    const ds = layer("LRO_Diviner_ST_Avg_Clr_Global_32ppd");
    expect(layerHasData(ds, -75, 0)).toBe(false);
    expect(layerHasData(ds, 30, 100)).toBe(true);
  });
  it("counts the pole itself as inside a polar footprint that ends 0.005° short of −90°", () => {
    expect(layerHasData(layer("LRO_LOLA_ClrSlope_SPole75S_120m_EQ"), -90, 0)).toBe(true);
    expect(layerHasData(layer("LRO_LOLA_ClrSlope_SPole75S_120m_EQ"), -60, 0)).toBe(false);
  });
});

describe("polar resampling plan", () => {
  const il = layer("LRO_LOLA_Illumination_SPole65S_240m_EQ");
  const z = 5;
  const plan = planPolar(il, 600, 64, z);
  const rows = gridRows(z);
  const cols = gridCols(z);

  it("the pole pixel lands in the last tile row; every pixel near the pole has data", () => {
    const centre = 32 * 64 + 32;
    const id = plan.tile[centre];
    expect(id).toBeGreaterThanOrEqual(0);
    expect(Math.floor(id / cols)).toBe(rows - 1);
    expect(plan.tile.every((t) => t >= 0)).toBe(true); // the whole 600 km square is inside 65°S–90°S
  });
  it("+y points to the 0° meridian and +x to 90°E, so the right-hand pixel sits in the 90°E column", () => {
    const top = plan.tile[2 * 64 + 32]; // row 2, centre column: toward +y, lon ≈ 0°
    const right = plan.tile[32 * 64 + 61]; // centre row, near the right edge: toward +x, lon ≈ +90°
    const colTop = top % cols;
    const colRight = right % cols;
    // lon 0° → column cols/2; lon 90° → column 3·cols/4
    expect(Math.abs(colTop - cols / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(colRight - (3 * cols) / 4)).toBeLessThanOrEqual(1);
  });
  it("only needs a handful of tiles and fills the output from them, leaving missing tiles transparent", () => {
    expect(plan.needed.length).toBeGreaterThan(2);
    expect(plan.needed.length).toBeLessThan(cols * 3 + 1); // at most the last three tile rows (the disc reaches ~10° from the pole)
    const tiles = new Map<number, Uint8ClampedArray>();
    const solid = new Uint8ClampedArray(256 * 256 * 4);
    for (let i = 0; i < solid.length; i += 4) {
      solid[i] = 200;
      solid[i + 1] = 100;
      solid[i + 2] = 50;
      solid[i + 3] = 255;
    }
    tiles.set(plan.needed[0], solid);
    const out = new Uint8ClampedArray(64 * 64 * 4);
    const filled = fillFromTiles(plan, tiles, out);
    expect(filled).toBeGreaterThan(0);
    expect(filled).toBeLessThan(64 * 64);
    const some = plan.tile.findIndex((t) => t === plan.needed[0]);
    expect([out[some * 4], out[some * 4 + 1], out[some * 4 + 2], out[some * 4 + 3]]).toEqual([200, 100, 50, 255]);
    const missing = plan.tile.findIndex((t) => t >= 0 && t !== plan.needed[0]);
    expect(out[missing * 4 + 3]).toBe(0);
  });
  it("a layer that stops at 60°S leaves the polar pixels empty", () => {
    const p = planPolar(layer("LRO_Diviner_ST_Avg_Clr_Global_32ppd"), 600, 32, 3);
    expect(p.needed.length).toBe(0);
    expect(p.tile.every((t) => t === -1)).toBe(true);
  });
});
