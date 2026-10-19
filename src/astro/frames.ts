import * as Astro from "astronomy-engine";
import { DEG } from "./constants";
import { type Mat3, type Vec3, mulMM, mulMV, rotX, rotZ, scale, sub } from "./vec";

/**
 * Rotation from J2000 equatorial (EQJ) to the Moon-fixed frame, per the IAU
 * WGCCRE convention: Q = R3(W) · R1(90° − δ) · R3(90° + α).
 *
 * Moon-fixed axes: +X → (0°N, 0°E), +Y → (0°N, 90°E), +Z → lunar north pole.
 * Pole (α, δ) and prime-meridian angle W come from astronomy-engine's
 * `RotationAxis`, which includes the IAU libration terms.
 */
export function eqjToMoonFixed(time: Astro.FlexibleDateTime): Mat3 {
  const axis = Astro.RotationAxis(Astro.Body.Moon, time);
  const alpha = axis.ra * 15 * DEG; // RA is returned in hours
  const delta = axis.dec * DEG;
  const w = axis.spin * DEG;
  return mulMM(rotZ(w), mulMM(rotX(Math.PI / 2 - delta), rotZ(Math.PI / 2 + alpha)));
}

/** Where the Sun and Earth are relative to the Moon's centre, in the Moon-fixed frame (km). */
export interface MoonState {
  /** UTC instant this state was computed for. */
  readonly time: Date;
  /** Moon centre → Sun centre, Moon-fixed, km. */
  readonly sunKm: Vec3;
  /** Moon centre → Earth centre, Moon-fixed, km. */
  readonly earthKm: Vec3;
  /** Earth–Moon centre distance, km. */
  readonly earthMoonKm: number;
  /** EQJ → Moon-fixed rotation at `time` (lets other bodies, such as ground stations, be expressed in this frame). */
  readonly q: Mat3;
  /** Earth centre → Moon centre, EQJ, km. */
  readonly moonEqjKm: Vec3;
}

/**
 * COMPUTED: geometric (not light-time/aberration corrected) positions. At the
 * Sun's 1 AU distance the omitted corrections are well under 0.01°; for the
 * Earth the Moon moves ~1 km per light-second, i.e. ~0.0003°.
 */
export function moonState(time: Date): MoonState {
  const q = eqjToMoonFixed(time);
  const moonGeo = Astro.GeoVector(Astro.Body.Moon, time, false);
  const sunGeo = Astro.GeoVector(Astro.Body.Sun, time, false);
  const moonKm: Vec3 = [
    moonGeo.x * Astro.KM_PER_AU,
    moonGeo.y * Astro.KM_PER_AU,
    moonGeo.z * Astro.KM_PER_AU,
  ];
  const sunKm: Vec3 = [
    sunGeo.x * Astro.KM_PER_AU,
    sunGeo.y * Astro.KM_PER_AU,
    sunGeo.z * Astro.KM_PER_AU,
  ];
  const sunRelEqj = sub(sunKm, moonKm);
  const earthRelEqj = scale(moonKm, -1);
  return {
    time,
    sunKm: mulMV(q, sunRelEqj),
    earthKm: mulMV(q, earthRelEqj),
    earthMoonKm: Math.hypot(moonKm[0], moonKm[1], moonKm[2]),
    q,
    moonEqjKm: moonKm,
  };
}
