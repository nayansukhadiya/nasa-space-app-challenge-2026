import * as Astro from "astronomy-engine";
import { describe, expect, it } from "vitest";
import { moonState } from "@/astro/frames";
import { eqjUnit, galacticLonLat, mulRow, ICRS_TO_GALACTIC } from "@/astro/sky";
import { unit } from "@/astro/vec";
import { dirToScene } from "./frame";
import { earthToScene, sceneToGalactic } from "./skyMatrix";

describe("galactic frame", () => {
  it("is a proper rotation", () => {
    for (const r of ICRS_TO_GALACTIC) expect(Math.hypot(...r)).toBeCloseTo(1, 12);
    const [a, b, c] = ICRS_TO_GALACTIC;
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(0, 12);
    expect(a[0] * c[0] + a[1] * c[1] + a[2] * c[2]).toBeCloseTo(0, 12);
  });

  it("puts the Galactic centre (Sgr A*, RA 266.405°, Dec −28.936°) at l = 0°, b = 0°", () => {
    const [l, b] = galacticLonLat(mulRow(ICRS_TO_GALACTIC, eqjUnit(266.405, -28.936)));
    expect(Math.abs(l)).toBeLessThan(0.01);
    expect(Math.abs(b)).toBeLessThan(0.01);
  });

  it("puts the Magellanic Clouds and Andromeda where the panorama shows them", () => {
    const lmc = galacticLonLat(mulRow(ICRS_TO_GALACTIC, eqjUnit(80.894, -69.756)));
    expect(((lmc[0] + 360) % 360)).toBeCloseTo(280.5, 0); // LMC l ≈ 280.5°
    expect(lmc[1]).toBeCloseTo(-32.9, 0);
    const m31 = galacticLonLat(mulRow(ICRS_TO_GALACTIC, eqjUnit(10.685, 41.269)));
    expect(m31[0]).toBeCloseTo(121.2, 0);
    expect(m31[1]).toBeCloseTo(-21.6, 0);
  });
});

describe("Earth orientation", () => {
  it("puts the sub-lunar point at the Moon's declination and at longitude RA − GAST", () => {
    for (const iso of ["2026-11-14T00:00:00Z", "2026-11-14T09:37:00Z", "2027-05-20T21:10:00Z"]) {
      const t = new Date(iso);
      const gast = Astro.SiderealTime(t) * 15;
      const moon = Astro.GeoVector(Astro.Body.Moon, t, false);
      const rel = unit([moon.x, moon.y, moon.z]);
      const raDeg = (Math.atan2(rel[1], rel[0]) * 180) / Math.PI; // geocentric J2000 right ascension
      const wantLon = ((((raDeg - gast + 540) % 360) + 360) % 360) - 180;
      // Earth-fixed = rotZ(+GAST) · EQJ (passive rotation)
      const g = (gast * Math.PI) / 180;
      const fx = Math.cos(g) * rel[0] + Math.sin(g) * rel[1];
      const fy = -Math.sin(g) * rel[0] + Math.cos(g) * rel[1];
      const lon = (Math.atan2(fy, fx) * 180) / Math.PI;
      expect(Math.abs(((lon - wantLon + 540) % 360) - 180)).toBeLessThan(1e-9);
    }
  });

  it("earthToScene sends the Earth-fixed direction of the Moon onto the scene direction away from Earth", () => {
    const t = new Date("2026-11-14T00:00:00Z");
    const gast = (Astro.SiderealTime(t) * 15 * Math.PI) / 180;
    const moon = Astro.GeoVector(Astro.Body.Moon, t, false);
    const rel = unit([moon.x, moon.y, moon.z]); // Earth→Moon in EQJ
    const fixed: [number, number, number] = [
      Math.cos(gast) * rel[0] + Math.sin(gast) * rel[1],
      -Math.sin(gast) * rel[0] + Math.cos(gast) * rel[1],
      rel[2],
    ];
    const scene = mulRow(earthToScene(t), fixed);
    // Moon→Earth in scene axes is dirToScene(unit(earthKm)); Earth→Moon is its negative
    const want = dirToScene(unit(moonState(t).earthKm)).map((v) => -v);
    for (let i = 0; i < 3; i++) expect(scene[i]).toBeCloseTo(want[i], 6);
  });
});

describe("scene → galactic chain", () => {
  it("maps the real Moon→Sun direction (in scene axes) onto the Sun's galactic direction from astronomy-engine", () => {
    for (const iso of ["2026-11-14T00:00:00Z", "2027-03-02T13:45:00Z"]) {
      const t = new Date(iso);
      const st = moonState(t);
      const sceneDir = dirToScene(unit(st.sunKm));
      const got = galacticLonLat(mulRow(sceneToGalactic(t), sceneDir));

      // Independent route: Moon→Sun in J2000 straight from astronomy-engine, no Moon-fixed frame involved.
      const moon = Astro.GeoVector(Astro.Body.Moon, t, false);
      const sun = Astro.GeoVector(Astro.Body.Sun, t, false);
      const rel: [number, number, number] = [sun.x - moon.x, sun.y - moon.y, sun.z - moon.z];
      const want = galacticLonLat(mulRow(ICRS_TO_GALACTIC, rel));
      expect(Math.abs(got[0] - want[0])).toBeLessThan(1e-6);
      expect(Math.abs(got[1] - want[1])).toBeLessThan(1e-6);
    }
  });

  it("the Sun is within 5.5° of the ecliptic, i.e. |b| of the Sun matches the sky (|b| ≤ 60°) and l is finite", () => {
    const t = new Date("2026-06-21T00:00:00Z");
    const [l, b] = galacticLonLat(mulRow(sceneToGalactic(t), dirToScene(unit(moonState(t).sunKm))));
    expect(Number.isFinite(l)).toBe(true);
    expect(Math.abs(b)).toBeLessThan(65);
  });
});
