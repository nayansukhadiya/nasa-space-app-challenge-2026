import { DEG, MOON_RADIUS_KM, RAD } from "@/astro/constants";

/**
 * South-polar stereographic projection, scale factor 1 at the pole, on the
 * lunar reference sphere (the convention of the LOLA polar DEM products).
 *
 *   ρ = 2R · tan(π/4 + φ/2)      x = ρ · sin λ      y = ρ · cos λ
 *
 * x, y are km from the pole; +y points toward the 0° meridian, +x toward 90°E.
 */
export function latLonToXY(latDeg: number, lonDeg: number, radiusKm = MOON_RADIUS_KM): [number, number] {
  const rho = 2 * radiusKm * Math.tan(Math.PI / 4 + (latDeg * DEG) / 2);
  const lam = lonDeg * DEG;
  return [rho * Math.sin(lam), rho * Math.cos(lam)];
}

export function xyToLatLon(x: number, y: number, radiusKm = MOON_RADIUS_KM): [number, number] {
  const rho = Math.hypot(x, y);
  const lat = (2 * Math.atan(rho / (2 * radiusKm)) - Math.PI / 2) * RAD;
  const lon = rho === 0 ? 0 : Math.atan2(x, y) * RAD;
  return [lat, lon];
}
