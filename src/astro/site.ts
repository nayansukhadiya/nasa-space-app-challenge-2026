import { C_KM_S, DEG, EARTH_RADIUS_KM, MOON_RADIUS_KM, RAD, SUN_RADIUS_KM } from "./constants";
import type { MoonState } from "./frames";
import { type Vec3, dot, norm, scale, sub } from "./vec";

export interface Site {
  id: string;
  name: string;
  /** Selenographic latitude, degrees (south negative). */
  latDeg: number;
  /** Selenographic longitude, degrees east. */
  lonDeg: number;
  /** Height above the reference sphere, km (MEASURED from the DEM when available). */
  heightKm?: number;
}

type SitePos = Pick<Site, "latDeg" | "lonDeg" | "heightKm">;

export interface LocalBasis {
  east: Vec3;
  north: Vec3;
  up: Vec3;
}

/** East/North/Up unit vectors of a site, expressed in the Moon-fixed frame. */
export function localBasis(latDeg: number, lonDeg: number): LocalBasis {
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const sl = Math.sin(lam);
  const cl = Math.cos(lam);
  return {
    east: [-sl, cl, 0],
    north: [-sp * cl, -sp * sl, cp],
    up: [cp * cl, cp * sl, sp],
  };
}

/** Site position from the Moon's centre, Moon-fixed, km. */
export function sitePositionKm(latDeg: number, lonDeg: number, heightKm = 0): Vec3 {
  return scale(localBasis(latDeg, lonDeg).up, MOON_RADIUS_KM + heightKm);
}

export interface LookAngles {
  /** Elevation of the target's centre above the local horizontal plane, degrees. */
  elDeg: number;
  /** Azimuth, degrees clockwise from local north. */
  azDeg: number;
  /** Straight-line range from the site, km. */
  rangeKm: number;
}

/** Topocentric look angles (parallax included) to a point given in the Moon-fixed frame. */
export function lookAngles(target: Vec3, site: SitePos): LookAngles {
  const b = localBasis(site.latDeg, site.lonDeg);
  const rel = sub(target, sitePositionKm(site.latDeg, site.lonDeg, site.heightKm ?? 0));
  const range = norm(rel);
  const e = dot(rel, b.east);
  const n = dot(rel, b.north);
  const u = dot(rel, b.up);
  const az = Math.atan2(e, n) * RAD;
  return {
    elDeg: Math.asin(u / range) * RAD,
    azDeg: (az + 360) % 360,
    rangeKm: range,
  };
}

/** Light-travel time in milliseconds from the Earth's centre to a site. COMPUTED: distance ÷ c. */
export function lightTimeMs(state: MoonState, site: SitePos): number {
  const p = sitePositionKm(site.latDeg, site.lonDeg, site.heightKm ?? 0);
  return (norm(sub(state.earthKm, p)) / C_KM_S) * 1000;
}

/** Light-travel time between the two body centres, milliseconds. */
export function centreLightTimeMs(state: MoonState): number {
  return (state.earthMoonKm / C_KM_S) * 1000;
}

/** Angular semi-diameter of a sphere of `radiusKm` seen from `rangeKm`, degrees. */
export const semiDiameterDeg = (radiusKm: number, rangeKm: number): number =>
  Math.asin(radiusKm / rangeKm) * RAD;

export const sunSemiDiameterDeg = (rangeKm: number): number => semiDiameterDeg(SUN_RADIUS_KM, rangeKm);
export const earthSemiDiameterDeg = (rangeKm: number): number => semiDiameterDeg(EARTH_RADIUS_KM, rangeKm);
