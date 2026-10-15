import * as THREE from "three";
import { MOON_RADIUS_KM } from "@/astro/constants";
import type { HeightSource } from "@/terrain/heightmap";
import { latLonToXY } from "@/terrain/projection";
import { surfacePoint } from "./frame";

/**
 * Whole-Moon mesh on a 0.5° lat/lon grid. Heights come from the composite height source (detail → wide →
 * global), so it matches the polar meshes where they overlap. Cells fully inside the polar square
 * (±`holeHalfKm` from the pole) are omitted because a finer mesh sits there.
 * Texture coordinates: u = (lon + 180)/360, v = (lat + 90)/180 (CanvasTexture flips Y, so v = 1 is +90°).
 */
export function buildGlobeGeometry(
  terrain: HeightSource,
  exaggeration: number,
  holeHalfKm: number,
  stepDeg = 0.5,
): THREE.BufferGeometry {
  const nLon = Math.round(360 / stepDeg);
  const nLat = Math.round(180 / stepDeg);
  const stride = nLon + 1;
  const positions = new Float32Array((nLat + 1) * stride * 3);
  const uvs = new Float32Array((nLat + 1) * stride * 2);

  for (let i = 0; i <= nLat; i++) {
    const lat = 90 - i * stepDeg;
    for (let j = 0; j <= nLon; j++) {
      const lon = -180 + j * stepDeg;
      const h = terrain.heightAtLatLon(lat, lon);
      const p = surfacePoint(lat, lon, Number.isNaN(h) ? 0 : h, exaggeration);
      const k = i * stride + j;
      positions[k * 3] = p[0];
      positions[k * 3 + 1] = p[1];
      positions[k * 3 + 2] = p[2];
      uvs[k * 2] = j / nLon;
      uvs[k * 2 + 1] = 1 - i / nLat;
    }
  }

  const inHole = (lat: number, lon: number): boolean => {
    if (lat > -55) return false;
    const [x, y] = latLonToXY(lat, lon);
    return Math.abs(x) <= holeHalfKm && Math.abs(y) <= holeHalfKm;
  };

  const index: number[] = [];
  for (let i = 0; i < nLat; i++) {
    const lat0 = 90 - i * stepDeg;
    const lat1 = lat0 - stepDeg;
    for (let j = 0; j < nLon; j++) {
      const lon0 = -180 + j * stepDeg;
      const lon1 = lon0 + stepDeg;
      if (holeHalfKm > 0 && inHole(lat0, lon0) && inHole(lat0, lon1) && inHole(lat1, lon0) && inHole(lat1, lon1)) continue;
      const a = i * stride + j;
      const b = a + stride; // one step south
      const c = a + 1; // one step east
      const d = b + 1;
      // (b − a) × (c − a) = south × east = up (outward)
      index.push(a, b, c, c, b, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1));
  geo.computeVertexNormals();

  // Hide the longitude seam and the pole fans: duplicated seam vertices share one normal, and the
  // pole rows use the radial direction.
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const center = new THREE.Vector3(0, -MOON_RADIUS_KM, 0);
  for (let i = 0; i <= nLat; i++) {
    const a = i * stride;
    const b = a + nLon;
    v.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, v.x, v.y, v.z);
    nrm.setXYZ(b, v.x, v.y, v.z);
  }
  for (const i of [0, nLat]) {
    for (let j = 0; j <= nLon; j++) {
      const k = i * stride + j;
      v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(center).normalize();
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeBoundingSphere();
  return geo;
}
