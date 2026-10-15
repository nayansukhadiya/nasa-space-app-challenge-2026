import * as THREE from "three";
import { DEG } from "@/astro/constants";

/**
 * Unit sphere in body-fixed axes (X→(0°N,0°E), Y→90°E, Z→north) with equirectangular UVs:
 * u = (lon + 180)/360, v = (lat + 90)/180 (CanvasTexture/Texture flipY makes v = 1 the top, +90°).
 */
export function unitSphere(stepDeg = 1): THREE.BufferGeometry {
  const nLon = 360 / stepDeg;
  const nLat = 180 / stepDeg;
  const stride = nLon + 1;
  const pos = new Float32Array((nLat + 1) * stride * 3);
  const uv = new Float32Array((nLat + 1) * stride * 2);
  for (let i = 0; i <= nLat; i++) {
    const lat = (90 - i * stepDeg) * DEG;
    for (let j = 0; j <= nLon; j++) {
      const lon = (-180 + j * stepDeg) * DEG;
      const k = i * stride + j;
      pos[k * 3] = Math.cos(lat) * Math.cos(lon);
      pos[k * 3 + 1] = Math.cos(lat) * Math.sin(lon);
      pos[k * 3 + 2] = Math.sin(lat);
      uv[k * 2] = j / nLon;
      uv[k * 2 + 1] = 1 - i / nLat;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const a = i * stride + j;
      const b = a + stride;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
