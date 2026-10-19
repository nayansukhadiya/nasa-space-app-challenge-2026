/**
 * Imperative camera controls for the Google-Earth-style buttons. CameraRig (inside the 3D canvas) fills these in;
 * the buttons (outside it) just call them. They no-op until the scene has mounted.
 */
export const cameraBus: {
  zoom: (factor: number) => void;
  tilt: (deltaRad: number) => void;
  turn: (deltaRad: number) => void;
  home: () => void;
  /** Fly the orbit camera to a lat/lon (pan + zoom), Google/Apple-maps style. No-op until mounted. */
  flyTo: (latDeg: number, lonDeg: number, opts?: { distanceKm?: number }) => void;
  /** Ground view only: turn to face Earth, the Sun or a compass point. */
  look: (what: "earth" | "sun" | "n" | "e" | "s" | "w") => void;
  /** Ground view only: change the field of view (multiplier). */
  fov: (factor: number) => void;
} = {
  zoom: () => {},
  tilt: () => {},
  turn: () => {},
  home: () => {},
  flyTo: () => {},
  look: () => {},
  fov: () => {},
};
