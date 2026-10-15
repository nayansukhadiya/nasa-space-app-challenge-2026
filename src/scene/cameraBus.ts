/**
 * Imperative camera controls for the Google-Earth-style buttons. CameraRig (inside the 3D canvas) fills these in;
 * the buttons (outside it) just call them. They no-op until the scene has mounted.
 */
export const cameraBus: {
  zoom: (factor: number) => void;
  tilt: (deltaRad: number) => void;
  turn: (deltaRad: number) => void;
  home: () => void;
  /** Ground view only: turn to face Earth, the Sun or a compass point. */
  look: (what: "earth" | "sun" | "n" | "e" | "s" | "w") => void;
  /** Ground view only: change the field of view (multiplier). */
  fov: (factor: number) => void;
} = {
  zoom: () => {},
  tilt: () => {},
  turn: () => {},
  home: () => {},
  look: () => {},
  fov: () => {},
};
