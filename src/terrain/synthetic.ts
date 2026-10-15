import { Heightmap, type HeightmapMeta } from "./heightmap";
import { latLonToXY } from "./projection";

export interface Feature {
  /** Polar-stereographic centre, km. */
  x: number;
  y: number;
  /** Height added at the centre (km); negative digs a pit. */
  heightKm: number;
  /** 1-sigma width of the Gaussian, km. */
  sigmaKm: number;
}

/**
 * SYNTHETIC terrain for tests and the explicitly-labelled `?synthetic` dev mode.
 * It is NOT lunar data and must never be presented as such: `meta.synthetic` is
 * true and the UI shows a banner whenever it is loaded.
 */
export function makeSyntheticHeightmap(size: number, extentKm: number, features: Feature[]): Heightmap {
  const data = new Float32Array(size * size);
  const px = extentKm / size;
  let min = Infinity;
  let max = -Infinity;
  for (let row = 0; row < size; row++) {
    const y = extentKm / 2 - (row + 0.5) * px;
    for (let col = 0; col < size; col++) {
      const x = (col + 0.5) * px - extentKm / 2;
      let h = 0;
      for (const f of features) {
        const dx = x - f.x;
        const dy = y - f.y;
        h += f.heightKm * Math.exp(-(dx * dx + dy * dy) / (2 * f.sigmaKm * f.sigmaKm));
      }
      data[row * size + col] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  const meta: HeightmapMeta = {
    version: 1,
    size,
    extentKm,
    radiusKm: 1737.4,
    minKm: min,
    maxKm: max,
    source: "SYNTHETIC — not lunar data",
    synthetic: true,
  };
  return new Heightmap(meta, data);
}

/** Gaussian hill at a selenographic position. */
export const hillAt = (latDeg: number, lonDeg: number, heightKm: number, sigmaKm: number): Feature => {
  const [x, y] = latLonToXY(latDeg, lonDeg);
  return { x, y, heightKm, sigmaKm };
};

/**
 * A demo polar landscape for `?synthetic`: a deep bowl near the pole with a
 * raised rim ridge and two massifs. Purely for exercising the UI and shaders.
 */
export function demoSyntheticHeightmap(size = 512, extentKm = 640): Heightmap {
  const feats: Feature[] = [
    { x: 0, y: 0, heightKm: -3.5, sigmaKm: 18 },
    { x: 0, y: 0, heightKm: 2.5, sigmaKm: 40 },
    { x: 90, y: 60, heightKm: 5, sigmaKm: 22 },
    { x: -120, y: -50, heightKm: 4, sigmaKm: 30 },
    { x: 40, y: -140, heightKm: -3, sigmaKm: 25 },
    { x: -60, y: 150, heightKm: 3.5, sigmaKm: 28 },
  ];
  return makeSyntheticHeightmap(size, extentKm, feats);
}
