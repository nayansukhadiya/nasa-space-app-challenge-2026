import type { MoonState } from "./frames";
import type { HorizonMask } from "./horizon";
import { horizonElevationDeg } from "./horizon";
import { type Site, earthSemiDiameterDeg, lightTimeMs, lookAngles, sitePositionKm, sunSemiDiameterDeg } from "./site";
import { angleBetweenDeg, earthCoverFraction, limbDarkenedFraction } from "./solar";
import { STATION_MIN_MOON_ELEVATION_DEG, stationStates } from "./stations";
import { sub } from "./vec";

export interface SunStatus {
  elDeg: number;
  azDeg: number;
  semiDiameterDeg: number;
  /** Terrain horizon elevation at the Sun's azimuth, degrees. */
  horizonDeg: number;
  /** True when any part of the solar disc (upper limb) clears the horizon. */
  lit: boolean;
  /** Intensity-weighted share (0–1) of the disc above the terrain horizon (limb-darkened). */
  discFraction: number;
  /** Share (0–1) of the disc covered by the Earth: non-zero only during a lunar eclipse. */
  eclipseCover: number;
  /** Net light reaching the site relative to an unobstructed Sun: discFraction × (1 − eclipseCover). */
  fraction: number;
  /** Site → Sun distance, km. */
  rangeKm: number;
}

export interface EarthStatus {
  elDeg: number;
  azDeg: number;
  horizonDeg: number;
  /** Earth's centre above the horizon. */
  visible: boolean;
  /** Part of the disc is above the horizon but the centre is not. */
  partial: boolean;
  rangeKm: number;
}

/**
 * COMPUTED: Sun status at a site. "Lit" uses the upper limb against the terrain
 * horizon; no atmospheric refraction (the Moon has none worth modelling).
 */
export function sunStatus(state: MoonState, site: Site, mask: HorizonMask): SunStatus {
  const look = lookAngles(state.sunKm, site);
  const sd = sunSemiDiameterDeg(look.rangeKm);
  const horizonDeg = horizonElevationDeg(mask, look.azDeg);
  const discFraction = limbDarkenedFraction(look.elDeg, sd, horizonDeg);
  const eclipseCover = earthCoverOfSun(state, site, sd);
  return {
    elDeg: look.elDeg,
    azDeg: look.azDeg,
    semiDiameterDeg: sd,
    horizonDeg,
    lit: look.elDeg + sd > horizonDeg,
    discFraction,
    eclipseCover,
    fraction: discFraction * (1 - eclipseCover),
    rangeKm: look.rangeKm,
  };
}

/**
 * COMPUTED: how much of the Sun the Earth hides, seen from the site (topocentric, so the Moon's own parallax of
 * ~0.26° is included). The Earth only gets near the Sun's direction around a lunar eclipse, so the cheap angular
 * separation test returns 0 almost always.
 */
export function earthCoverOfSun(state: MoonState, site: Site, sunSemiDiameter: number): number {
  const p = sitePositionKm(site.latDeg, site.lonDeg, site.heightKm ?? 0);
  const toSun = sub(state.sunKm, p);
  const toEarth = sub(state.earthKm, p);
  const sep = angleBetweenDeg(toSun, toEarth);
  const earthR = earthSemiDiameterDeg(Math.hypot(toEarth[0], toEarth[1], toEarth[2]));
  return earthCoverFraction(sep, sunSemiDiameter, earthR);
}

/** COMPUTED: direct line of sight to Earth, blocked by the terrain horizon. */
export function earthStatus(state: MoonState, site: Site, mask: HorizonMask): EarthStatus {
  const look = lookAngles(state.earthKm, site);
  const sd = earthSemiDiameterDeg(look.rangeKm);
  const horizonDeg = horizonElevationDeg(mask, look.azDeg);
  const visible = look.elDeg > horizonDeg;
  return {
    elDeg: look.elDeg,
    azDeg: look.azDeg,
    horizonDeg,
    visible,
    partial: !visible && look.elDeg + sd > horizonDeg,
    rangeKm: look.rangeKm,
  };
}

export interface StationLink {
  id: string;
  name: string;
  /** Elevation / azimuth of the station as seen from the site, degrees. */
  elDeg: number;
  azDeg: number;
  horizonDeg: number;
  /** The station clears the site's terrain horizon. */
  siteSeesStation: boolean;
  /** The Moon stands above the station's keep-out elevation. */
  moonElAtStationDeg: number;
  stationSeesMoon: boolean;
  /** Site → station straight-line range, km. */
  rangeKm: number;
  /** Both ends can see each other. */
  linked: boolean;
}

export interface DsnStatus {
  stations: StationLink[];
  /** At least one station is mutually visible with the site. */
  linked: boolean;
  /** The mutually visible station with the Moon highest over it (least atmosphere), or null. */
  best: StationLink | null;
}

/**
 * COMPUTED: station-by-station line of sight (peer-review gap 3). Earth's disc is ~0.95° across as seen from the
 * Moon, so near the horizon the direction to Madrid can clear a rim that the direction to Earth's centre does not.
 * A link needs the station above the site's terrain horizon AND the Moon above the station's own 10° keep-out.
 */
export function dsnStatus(state: MoonState, site: Site, mask: HorizonMask): DsnStatus {
  const stations = stationStates(state).map((s): StationLink => {
    const look = lookAngles(s.posKm, site);
    const horizonDeg = horizonElevationDeg(mask, look.azDeg);
    const siteSeesStation = look.elDeg > horizonDeg;
    const stationSeesMoon = s.moonElDeg >= STATION_MIN_MOON_ELEVATION_DEG;
    return {
      id: s.station.id,
      name: s.station.name,
      elDeg: look.elDeg,
      azDeg: look.azDeg,
      horizonDeg,
      siteSeesStation,
      moonElAtStationDeg: s.moonElDeg,
      stationSeesMoon,
      rangeKm: look.rangeKm,
      linked: siteSeesStation && stationSeesMoon,
    };
  });
  const live = stations.filter((s) => s.linked);
  const best = live.length ? live.reduce((a, b) => (b.moonElAtStationDeg > a.moonElAtStationDeg ? b : a)) : null;
  return { stations, linked: live.length > 0, best };
}

export interface SiteTelemetry {
  sun: SunStatus;
  earth: EarthStatus;
  dsn: DsnStatus;
  lightTimeMs: number;
}

export function siteTelemetry(state: MoonState, site: Site, mask: HorizonMask): SiteTelemetry {
  return {
    sun: sunStatus(state, site, mask),
    earth: earthStatus(state, site, mask),
    dsn: dsnStatus(state, site, mask),
    lightTimeMs: lightTimeMs(state, site),
  };
}
