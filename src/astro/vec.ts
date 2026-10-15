export type Vec3 = readonly [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / norm(a));

export type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export const mulMV = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

export const mulMM = (a: Mat3, b: Mat3): Mat3 => {
  const col = (j: number): Vec3 => [b[0][j], b[1][j], b[2][j]];
  const c0 = col(0);
  const c1 = col(1);
  const c2 = col(2);
  return [
    [dot(a[0], c0), dot(a[0], c1), dot(a[0], c2)],
    [dot(a[1], c0), dot(a[1], c1), dot(a[1], c2)],
    [dot(a[2], c0), dot(a[2], c1), dot(a[2], c2)],
  ];
};

/** Passive rotation of the coordinate axes about z by `a` radians. */
export const rotZ = (a: number): Mat3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
};

/** Passive rotation of the coordinate axes about x by `a` radians. */
export const rotX = (a: number): Mat3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [1, 0, 0],
    [0, c, s],
    [0, -s, c],
  ];
};
