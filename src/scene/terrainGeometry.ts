import * as THREE from "three";
import type { Heightmap } from "@/terrain/heightmap";

/**
 * Curved terrain mesh: every vertex is the true 3-D position (R + k·h) of a DEM
 * sample on the lunar sphere, so a single directional light with the real Sun
 * vector lights and shadows it exactly, with no flat-map approximation.
 *
 * `stride` subsamples the DEM to keep the vertex count in budget.
 */
export function buildTerrainGeometry(
  map: Heightmap,
  exaggeration: number,
  stride = 1,
  /** Omit cells entirely inside ±holeHalfKm of the pole (where a finer mesh sits on top). */
  holeHalfKm = 0,
  /** Push the whole mesh down by this many km along the local up (avoids z-fighting at overlaps). */
  dropKm = 0,
): THREE.BufferGeometry {
  const { size } = map.meta;
  const n = Math.floor((size - 1) / stride) + 1;
  const R = map.radiusKm;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);

  let p = 0;
  let u = 0;
  for (let j = 0; j < n; j++) {
    const row = j * stride;
    const y = map.halfKm - (row + 0.5) * map.pixelKm;
    for (let i = 0; i < n; i++) {
      const col = i * stride;
      const x = (col + 0.5) * map.pixelKm - map.halfKm;
      const rho = Math.hypot(x, y);
      const t = rho / (2 * R);
      const cosPhi = (2 * t) / (1 + t * t); // cos(lat)
      const sinPhi = -(1 - t * t) / (1 + t * t); // sin(lat), south → negative
      const ux = rho === 0 ? 0 : (cosPhi * y) / rho; // Moon-fixed unit vector
      const uy = rho === 0 ? 0 : (cosPhi * x) / rho;
      const uz = sinPhi;
      const r = R + exaggeration * map.data[row * map.meta.size + col] - dropKm;
      // scene = (Yf, −Zf − R, −Xf)
      positions[p++] = uy * r;
      positions[p++] = -uz * r - R;
      positions[p++] = -ux * r;
      // Texture shares the heightmap layout (row 0 = +y); canvas textures are flipped, so v = 1 at the top.
      uvs[u++] = (col + 0.5) / size;
      uvs[u++] = 1 - (row + 0.5) / size;
    }
  }

  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      if (holeHalfKm > 0) {
        // Skip a cell when all four of its corners are inside the hole square.
        const cx = [i, i + 1].map((c) => Math.abs((c * stride + 0.5) * map.pixelKm - map.halfKm));
        const cy = [j, j + 1].map((r) => Math.abs(map.halfKm - (r * stride + 0.5) * map.pixelKm));
        if (Math.max(...cx) <= holeHalfKm && Math.max(...cy) <= holeHalfKm) continue;
      }
      const a = j * n + i;
      const b = a + n;
      const c = a + 1;
      const d = b + 1;
      // a=(col,row) b=(col,row+1) c=(col+1,row): (b−a)×(c−a) = +Y (outward)
      index[q++] = a;
      index[q++] = b;
      index[q++] = c;
      index[q++] = c;
      index[q++] = b;
      index[q++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(index.subarray(0, q), 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
