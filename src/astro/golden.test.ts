import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moonState } from "./frames";
import { lookAngles } from "./site";

/**
 * Golden tests against NAIF SPICE (plan: ~50 reference values, agree within 0.1°).
 * The fixture is produced by `pipeline/fixtures.py`, which needs the SPICE kernels.
 * Until it has been generated these tests are SKIPPED, not passed.
 */
const FIXTURE = new URL("./fixtures/spice-golden.json", import.meta.url);
const present = existsSync(FIXTURE);

interface Look {
  elDeg: number;
  azDeg: number;
  rangeKm: number;
}
interface Sample {
  utc: string;
  latDeg: number;
  lonDeg: number;
  sun: Look;
  earth: Look;
  earthMoonKm: number;
}

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe.skipIf(!present)("golden values vs NAIF SPICE", () => {
  const samples: Sample[] = present ? JSON.parse(readFileSync(FIXTURE, "utf8")).samples : [];

  it("has the expected number of reference samples", () => {
    expect(samples.length).toBeGreaterThanOrEqual(50);
  });

  it.each(samples.map((s, i) => [i, s] as const))("sample %i: sun/earth look angles within 0.1°", (_i, s) => {
    const st = moonState(new Date(s.utc));
    const site = { latDeg: s.latDeg, lonDeg: s.lonDeg };
    const sun = lookAngles(st.sunKm, site);
    const earth = lookAngles(st.earthKm, site);
    expect(Math.abs(sun.elDeg - s.sun.elDeg)).toBeLessThan(0.1);
    expect(Math.abs(earth.elDeg - s.earth.elDeg)).toBeLessThan(0.1);
    // Azimuth is only well-conditioned away from the zenith.
    if (Math.abs(s.sun.elDeg) < 80) expect(angDiff(sun.azDeg, s.sun.azDeg)).toBeLessThan(0.1);
    if (Math.abs(s.earth.elDeg) < 80) expect(angDiff(earth.azDeg, s.earth.azDeg)).toBeLessThan(0.1);
    expect(Math.abs(st.earthMoonKm - s.earthMoonKm)).toBeLessThan(500);
  });
});
