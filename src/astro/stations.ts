import * as Astro from "astronomy-engine";
import type { MoonState } from "./frames";
import { type Vec3, dot, mulMV, norm, sub, unit } from "./vec";

/**
 * A ground station on Earth. Coordinates are approximate public values (±0.01°, ±20 m) for the Deep Space
 * Network's three complexes, spaced ~120° apart in longitude so one of them almost always has the Moon up.
 * Use them for geometry, not for navigation. Verify against the DSN 810-005 geometry module before quoting.
 */
export interface Station {
  id: string;
  name: string;
  latDeg: number;
  /** Geodetic longitude, degrees east. */
  lonDeg: number;
  heightM: number;
}

export const DSN_STATIONS: readonly Station[] = [
  { id: "goldstone", name: "Goldstone, USA", latDeg: 35.4259, lonDeg: -116.8895, heightM: 1002 },
  { id: "madrid", name: "Madrid, Spain", latDeg: 40.4272, lonDeg: -4.2480, heightM: 865 },
  { id: "canberra", name: "Canberra, Australia", latDeg: -35.4014, lonDeg: 148.9813, heightM: 689 },
];

/** A station needs the Moon this far above its own horizon (antenna keep-out, atmosphere, mechanical limits). */
export const STATION_MIN_MOON_ELEVATION_DEG = 10;

export interface StationState {
  station: Station;
  /** Moon centre → station, Moon-fixed frame, km. */
  posKm: Vec3;
  /** Elevation of the Moon's centre above the station's horizon, degrees. */
  moonElDeg: number;
}

const cache = new WeakMap<MoonState, StationState[]>();

/**
 * COMPUTED: where each station is in the Moon-fixed frame, and how high the Moon stands over it.
 * Earth orientation uses astronomy-engine's `ObserverVector` (sidereal time with nutation, WGS-84 oblateness).
 * Rotation uses the model's UT1≈UTC, which moves a station by under ~0.4 km (negligible; peer-review gap 21).
 */
export function stationStates(state: MoonState, stations: readonly Station[] = DSN_STATIONS): StationState[] {
  if (stations === DSN_STATIONS) {
    const hit = cache.get(state);
    if (hit) return hit;
  }
  const out = stations.map((station) => {
    const obs = new Astro.Observer(station.latDeg, station.lonDeg, station.heightM);
    const v = Astro.ObserverVector(state.time, obs, false); // Earth centre → station, EQJ, AU
    const stationEqj: Vec3 = [v.x * Astro.KM_PER_AU, v.y * Astro.KM_PER_AU, v.z * Astro.KM_PER_AU];
    // Moon centre → station = (Moon centre → Earth centre) + (Earth centre → station)
    const posKm = mulMV(state.q, sub(stationEqj, state.moonEqjKm));
    // Elevation of the Moon over the station: station→Moon vs the station's local up (geocentric radial; the
    // geodetic difference is ≤0.19° and irrelevant against a 10° keep-out).
    const toMoon = sub(state.moonEqjKm, stationEqj);
    const moonElDeg = (Math.asin(dot(unit(toMoon), unit(stationEqj))) * 180) / Math.PI;
    return { station, posKm, moonElDeg };
  });
  if (stations === DSN_STATIONS) cache.set(state, out);
  return out;
}

/** Distance from the Moon's centre to a station, km (sanity-check helper). */
export const stationRangeKm = (s: StationState): number => norm(s.posKm);

