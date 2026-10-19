import { describe, expect, it } from "vitest";
import { MOON_RADIUS_KM } from "./constants";
import {
  DEGREE2_FIELD,
  GM_MOON,
  POINT_MASS_FIELD,
  acceleration,
  circularPeriodS,
  freeFallS,
  hangTimeS,
  horizonDistanceKm,
  makeField,
  parseGravityJson,
  potential,
  surfaceGravity,
} from "./gravity";
import {
  angularMomentum,
  keplerToStateEqj,
  poleInertialToEqj,
  positionFixed,
  propagate,
  specificEnergy,
  stateAt,
} from "./orbit";
import { RELAY_PRESETS, inertialPosition, orbitPeriodS } from "./relay";
import { lunarClockGainUsPerDay, lunarClockRateOffset, relativisticShiftHz, shapiroDelayS } from "./relativity";
import { mulMV, norm, sub } from "./vec";

const sph = (r: number, latDeg: number, lonDeg: number): [number, number, number] => {
  const p = (latDeg * Math.PI) / 180;
  const l = (lonDeg * Math.PI) / 180;
  return [r * Math.cos(p) * Math.cos(l), r * Math.cos(p) * Math.sin(l), r * Math.sin(p)];
};

describe("spherical-harmonic gravity", () => {
  it("point mass: U = GM/r and |a| = GM/r², pointing at the centre", () => {
    const [x, y, z] = sph(2000, 33, 71);
    expect(potential(POINT_MASS_FIELD, x, y, z)).toBeCloseTo(GM_MOON / 2000, 10);
    const a = acceleration(POINT_MASS_FIELD, x, y, z);
    expect(norm(a)).toBeCloseTo(GM_MOON / 2000 ** 2, 12);
    expect(a[0] * x + a[1] * y + a[2] * z).toBeLessThan(0);
  });

  it("a C̄20-only field reproduces the closed-form J2 potential U = GM/r·[1 − J2 (a/r)² P2(sin φ)]", () => {
    const c20 = -9.088e-5;
    const f = makeField("J2", "test", GM_MOON, 1738, [{ n: 2, m: 0, c: c20 }]);
    const J2 = -c20 * Math.sqrt(5);
    for (const [r, lat] of [
      [1800, 0],
      [1900, -45],
      [2300, 89],
      [1750, 12],
    ] as const) {
      const [x, y, z] = sph(r, lat, 20);
      const s = Math.sin((lat * Math.PI) / 180);
      const P2 = (3 * s * s - 1) / 2;
      const want = (GM_MOON / r) * (1 - J2 * (1738 / r) ** 2 * P2);
      expect(potential(f, x, y, z)).toBeCloseTo(want, 10);
    }
  });

  it("radial acceleration matches the analytic J2 derivative −GM/r²·[1 − 3 J2 (a/r)² P2]", () => {
    const c20 = -9.088e-5;
    const f = makeField("J2", "test", GM_MOON, 1738, [{ n: 2, m: 0, c: c20 }]);
    const J2 = -c20 * Math.sqrt(5);
    const r = 1900;
    for (const lat of [-80, -30, 0, 55]) {
      const [x, y, z] = sph(r, lat, 0);
      const s = Math.sin((lat * Math.PI) / 180);
      const P2 = (3 * s * s - 1) / 2;
      const a = acceleration(f, x, y, z);
      const radial = (a[0] * x + a[1] * y + a[2] * z) / r;
      const want = -(GM_MOON / r ** 2) * (1 - 3 * J2 * (1738 / r) ** 2 * P2);
      expect(radial / want).toBeCloseTo(1, 7);
    }
  });

  it("the sectoral C̄22 term varies as cos 2λ and vanishes at λ = 45°", () => {
    const c22 = 3.4675e-5;
    const f = makeField("C22", "test", GM_MOON, 1738, [{ n: 2, m: 2, c: c22 }]);
    const r = 1800;
    const mono = GM_MOON / r;
    const P22 = (Math.sqrt(15) / 2) * 1; // equator: cos²φ = 1
    const q = (1738 / r) ** 2;
    const at0 = potential(f, ...sph(r, 0, 0));
    const at45 = potential(f, ...sph(r, 0, 45));
    const at90 = potential(f, ...sph(r, 0, 90));
    expect(at0).toBeCloseTo(mono * (1 + q * c22 * P22), 10);
    expect(at45).toBeCloseTo(mono, 10);
    expect(at90).toBeCloseTo(mono * (1 - q * c22 * P22), 10);
  });

  it("parseGravityJson round-trips and rejects a bad coefficient count", () => {
    const ok = parseGravityJson({ name: "t", source: "t", gm: GM_MOON, rRefKm: 1738, nMax: 2, c: [1, 0, 0, 0, 0, 0], s: [0, 0, 0, 0, 0, 0] });
    expect(ok.nMax).toBe(2);
    expect(() => parseGravityJson({ name: "t", source: "t", gm: 1, rRefKm: 1, nMax: 2, c: [1], s: [0] })).toThrow();
  });
});

describe("surface gravity", () => {
  it("is ~1.62 m/s² at the south pole (NASA Moon fact sheet) and varies with elevation", () => {
    const pole = surfaceGravity(DEGREE2_FIELD, -90, 0, 0);
    expect(pole.gMs2).toBeGreaterThan(1.61);
    expect(pole.gMs2).toBeLessThan(1.63);
    const rim = surfaceGravity(DEGREE2_FIELD, -89.9, 0, 4.8);
    const floor = surfaceGravity(DEGREE2_FIELD, -89.9, 0, -4.2);
    expect(floor.gMs2).toBeGreaterThan(rim.gMs2); // free-air gradient: closer to the centre → heavier
    // −2g/r per km ≈ −1.87e-3 m/s² per km
    expect((floor.gMs2 - rim.gMs2) / 9).toBeCloseTo((2 * 1.62) / MOON_RADIUS_KM, 4);
  });
  it("the equatorial bulge makes the equator's g larger than the pole's, by ≈ 4.5·J2 (centrifugal is ~1e-5 g)", () => {
    const pole = surfaceGravity(DEGREE2_FIELD, -90, 0, 0);
    const eq = surfaceGravity(DEGREE2_FIELD, 0, 45, 0); // λ = 45° kills C22, leaving J2
    const J2 = 9.088e-5 * Math.sqrt(5);
    const rel = (eq.gMs2 - pole.gMs2) / pole.gMs2;
    expect(rel).toBeGreaterThan(0);
    expect(rel).toBeCloseTo(4.5 * J2 * (1738 / MOON_RADIUS_KM) ** 2, 4);
  });
  it("escape speed ≈ 2.38 km/s and circular speed = escape/√2", () => {
    const g = surfaceGravity(POINT_MASS_FIELD, -89, 0, 0);
    expect(g.escapeKmS).toBeCloseTo(2.38, 2);
    expect(g.circularKmS * Math.SQRT2).toBeCloseTo(g.escapeKmS, 12);
  });
  it("everyday mechanics: a 1 m drop takes ~1.11 s; a 3 m/s jump hangs ~3.7 s; a 10 m mast sees 5.9 km", () => {
    expect(freeFallS(1, 1.62)).toBeCloseTo(1.111, 3);
    expect(hangTimeS(3, 1.62)).toBeCloseTo(3.704, 3);
    expect(horizonDistanceKm(0.01)).toBeCloseTo(5.895, 2);
    expect(circularPeriodS(MOON_RADIUS_KM + 100) / 3600).toBeCloseTo(1.96, 1); // ~118 min low lunar orbit
  });
});

describe("relativity of signals between Earth and Moon", () => {
  it("a lunar clock runs ~56 µs/day fast (Ashby & Patla 2024: 56.02 µs/day)", () => {
    expect(lunarClockGainUsPerDay()).toBeGreaterThan(55);
    expect(lunarClockGainUsPerDay()).toBeLessThan(57.5);
    expect(lunarClockRateOffset()).toBeCloseTo(6.5e-10, 11);
  });
  it("shifts an 8.4 GHz carrier by ≈ +5.4 Hz", () => {
    expect(relativisticShiftHz(8.4)).toBeGreaterThan(5.2);
    expect(relativisticShiftHz(8.4)).toBeLessThan(5.7);
  });
  it("Shapiro delay Earth→Moon is ~0.1 ns: real, and tiny next to the 1.28 s light time", () => {
    const d = shapiroDelayS(6378, 384_400, 384_400 - 6378);
    expect(d).toBeGreaterThan(5e-11);
    expect(d).toBeLessThan(5e-10);
  });
});

describe("numerical orbit propagation", () => {
  const circ = RELAY_PRESETS[0];
  const ell = RELAY_PRESETS[1];
  const day = 86_400;

  it("keplerToStateEqj starts on the analytic orbit (position and circular speed)", () => {
    const s = keplerToStateEqj(circ);
    const want = mulMV(poleInertialToEqj(circ.epochMs), inertialPosition(circ, circ.epochMs));
    expect(norm(sub(s.r, want))).toBeLessThan(1e-9);
    expect(norm(s.v)).toBeCloseTo(Math.sqrt(GM_MOON / circ.aKm), 9);
  });

  it("with a point-mass field and no third bodies RK4 reproduces the Kepler orbit (< 10 m after 2 days)", () => {
    const tr = propagate(keplerToStateEqj(circ), circ.epochMs, 2 * day, 30, { field: POINT_MASS_FIELD, earth: false, sun: false });
    const toEqj = poleInertialToEqj(circ.epochMs);
    for (const hours of [3, 17.3, 48]) {
      const t = circ.epochMs + hours * 3_600_000;
      const num = stateAt(tr, t).r;
      const ana = mulMV(toEqj, inertialPosition(circ, t));
      expect(norm(sub(num, ana))).toBeLessThan(0.01);
    }
  });

  it("conserves energy and angular momentum without perturbations", () => {
    const start = keplerToStateEqj(ell);
    const tr = propagate(start, ell.epochMs, day, 30, { field: POINT_MASS_FIELD, earth: false, sun: false });
    const end = stateAt(tr, ell.epochMs + day * 1000 - 1);
    expect(Math.abs((specificEnergy(end) - specificEnergy(start)) / specificEnergy(start))).toBeLessThan(1e-8); // RK4 at 30 s on a 12 h ellipse: ~1e-9 per day
    const h0 = angularMomentum(start);
    const h1 = angularMomentum(end);
    expect(norm(sub(h1, h0)) / norm(h0)).toBeLessThan(1e-8);
  });

  it("Moon gravity harmonics + Earth's pull make a real orbit leave the two-body ellipse", () => {
    const tr = propagate(keplerToStateEqj(ell), ell.epochMs, 3 * day, 60, { field: DEGREE2_FIELD, earth: true, sun: true });
    const toEqj = poleInertialToEqj(ell.epochMs);
    const t = ell.epochMs + 3 * day * 1000 - 60_000;
    const drift = norm(sub(stateAt(tr, t).r, mulMV(toEqj, inertialPosition(ell, t))));
    expect(drift).toBeGreaterThan(1); // km: the two-body picture is NOT navigation-grade
    expect(drift).toBeLessThan(5000); // but the orbit is still the same family of orbit
    expect(orbitPeriodS(ell) / 3600).toBeCloseTo(12, 6);
  });

  it("Hermite interpolation between samples agrees with a finer integration", () => {
    const f = { field: DEGREE2_FIELD, earth: true, sun: false };
    const coarse = propagate(keplerToStateEqj(circ), circ.epochMs, 6 * 3600, 60, f);
    const fine = propagate(keplerToStateEqj(circ), circ.epochMs, 6 * 3600, 5, f);
    const t = circ.epochMs + 2.5 * 3_600_000 + 17_000; // off the 60 s grid
    expect(norm(sub(stateAt(coarse, t).r, stateAt(fine, t).r))).toBeLessThan(0.05);
  });

  it("positionFixed keeps the orbital radius", () => {
    const tr = propagate(keplerToStateEqj(circ), circ.epochMs, 3600, 30, { field: POINT_MASS_FIELD, earth: false, sun: false });
    const t = circ.epochMs + 1800_000;
    expect(norm(positionFixed(tr, t))).toBeCloseTo(circ.aKm, 3);
  });
});
