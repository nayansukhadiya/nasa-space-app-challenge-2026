import type { MoonState } from "./frames";
import type { HorizonMask } from "./horizon";
import { horizonElevationDeg } from "./horizon";
import { type Site, earthSemiDiameterDeg, lightTimeMs, lookAngles, sunSemiDiameterDeg } from "./site";

export interface SunStatus {
  elDeg: number;
  azDeg: number;
  semiDiameterDeg: number;
  /** Terrain horizon elevation at the Sun's azimuth, degrees. */
  horizonDeg: number;
  /** True when any part of the solar disc (upper limb) clears the horizon. */
  lit: boolean;
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
  return {
    elDeg: look.elDeg,
    azDeg: look.azDeg,
    semiDiameterDeg: sd,
    horizonDeg,
    lit: look.elDeg + sd > horizonDeg,
    rangeKm: look.rangeKm,
  };
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

export interface SiteTelemetry {
  sun: SunStatus;
  earth: EarthStatus;
  lightTimeMs: number;
}

export function siteTelemetry(state: MoonState, site: Site, mask: HorizonMask): SiteTelemetry {
  return {
    sun: sunStatus(state, site, mask),
    earth: earthStatus(state, site, mask),
    lightTimeMs: lightTimeMs(state, site),
  };
}
