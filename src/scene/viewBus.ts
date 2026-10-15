/**
 * Where the main camera is looking on the Moon, written every frame by the scene and read by the
 * mini-map (no React renders involved). `valid` is false when the view ray misses the Moon.
 */
export const viewBus = {
  valid: false,
  latDeg: -90,
  lonDeg: 0,
  /** Angular radius of the visible area on the surface, degrees. */
  spanDeg: 10,
  /** Camera height above the Moon's reference sphere, km. */
  eyeAltKm: 0,
  /** Surface distance covered by one screen pixel at the point looked at, km. */
  kmPerPx: 1,
};
