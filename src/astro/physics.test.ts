import { describe, expect, it } from "vitest";
import { moonState } from "./frames";
import { flatHorizon } from "./horizon";
import { sweep } from "./sweep";
import { DSN_STATIONS, STATION_MIN_MOON_ELEVATION_DEG, stationStates } from "./stations";
import { type Site, lookAngles } from "./site";
import {
  LIMB_DARKENING_U,
  angleBetweenDeg,
  discVisibleFraction,
  earthCoverFraction,
  limbDarkenedFraction,
  panelIrradiance,
} from "./solar";
import { dsnStatus, sunStatus } from "./visibility";

/** Brute-force: integrate I(x,y) over the part of the unit disc with y > y0, on a fine grid. */
function numericLimbFraction(y0: number, u: number): number {
  const N = 1200;
  let vis = 0;
  let tot = 0;
  for (let i = 0; i < N; i++) {
    const x = -1 + ((i + 0.5) * 2) / N;
    for (let j = 0; j < N; j++) {
      const y = -1 + ((j + 0.5) * 2) / N;
      const r2 = x * x + y * y;
      if (r2 >= 1) continue;
      const I = 1 - u + u * Math.sqrt(1 - r2);
      tot += I;
      if (y > y0) vis += I;
    }
  }
  return vis / tot;
}

describe("limb-darkened Sun fraction", () => {
  it("is 1 with the Sun clear, 0 hidden, and exactly 0.5 when the horizon bisects the disc", () => {
    expect(limbDarkenedFraction(5, 0.267, 0)).toBe(1);
    expect(limbDarkenedFraction(-5, 0.267, 0)).toBe(0);
    expect(limbDarkenedFraction(0, 0.267, 0)).toBeCloseTo(0.5, 12);
  });
  it("agrees with brute-force 2-D integration of I = 1 − u(1 − μ) over the visible cap", () => {
    for (const d of [-0.9, -0.5, -0.1, 0.3, 0.7]) {
      // d = (elevation − horizon)/semi-diameter, so the horizon sits at y0 = −d
      const closed = limbDarkenedFraction(d * 0.267, 0.267, 0);
      expect(closed).toBeCloseTo(numericLimbFraction(-d, LIMB_DARKENING_U), 3);
    }
  });
  it("shows LESS light than the plain area fraction when only the bright-poor top limb is up", () => {
    const sd = 0.267;
    const el = -0.7 * sd; // only the top 15 % of the diameter clears the ridge
    expect(limbDarkenedFraction(el, sd, 0)).toBeLessThan(discVisibleFraction(el, sd, 0));
    // and more when most of the disc is up (the dim rim is what is hidden)
    const hi = 0.7 * sd;
    expect(limbDarkenedFraction(hi, sd, 0)).toBeGreaterThan(discVisibleFraction(hi, sd, 0));
  });
  it("u = 0 collapses to the uniform-disc circular segment", () => {
    for (const d of [-0.6, 0.2, 0.8]) {
      expect(limbDarkenedFraction(d * 0.267, 0.267, 0, 0)).toBeCloseTo(discVisibleFraction(d * 0.267, 0.267, 0), 12);
    }
  });
  it("feeds panelIrradiance, and an eclipse dims it proportionally", () => {
    const a = panelIrradiance(149_597_870.7, 1, 0.267, 0, 0);
    const b = panelIrradiance(149_597_870.7, 1, 0.267, 0, 0.25);
    expect(a.sunFacing).toBeCloseTo(1360.8, 3);
    expect(b.sunFacing).toBeCloseTo(0.75 * a.sunFacing, 6);
  });
});

describe("Earth eclipsing the Sun (two-circle overlap)", () => {
  const r = 0.267;
  const R = 0.95;
  it("is 0 when apart, 1 when the Sun is wholly behind the Earth", () => {
    expect(earthCoverFraction(2, r, R)).toBe(0);
    expect(earthCoverFraction(r + R, r, R)).toBe(0);
    expect(earthCoverFraction(0, r, R)).toBe(1);
    expect(earthCoverFraction(R - r, r, R)).toBe(1);
  });
  it("matches the closed-form lens area for equal circles at d = r", () => {
    // overlap/πr² = (2π/3 − √3/2)/π ≈ 0.39100
    expect(earthCoverFraction(1, 1, 1)).toBeCloseTo((2 * Math.PI) / 3 / Math.PI - Math.sqrt(3) / 2 / Math.PI, 12);
  });
  it("rises monotonically as the Earth slides over the Sun", () => {
    let prev = 0;
    for (let d = r + R; d >= R - r; d -= 0.02) {
      const c = earthCoverFraction(d, r, R);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = c;
    }
  });
  it("angleBetweenDeg is exact for tiny and near-antiparallel separations", () => {
    expect(angleBetweenDeg([1, 0, 0], [1, 1e-9, 0])).toBeCloseTo((1e-9 * 180) / Math.PI, 12);
    expect(angleBetweenDeg([1, 0, 0], [-1, 1e-9, 0])).toBeCloseTo(180, 6);
  });
});

describe("lunar eclipse of 14 March 2025, seen from the Moon", () => {
  // Total lunar eclipse; greatest eclipse ≈ 06:58 UTC. From the Moon the Earth sits in front of the Sun.
  const nearSide: Site = { id: "centre", name: "Near-side centre", latDeg: 0, lonDeg: 0 };
  const mask = flatHorizon();
  it("Earth hides essentially the whole Sun at mid-eclipse and none of it half a day before", () => {
    const mid = sunStatus(moonState(new Date(Date.UTC(2025, 2, 14, 6, 58))), nearSide, mask);
    const before = sunStatus(moonState(new Date(Date.UTC(2025, 2, 13, 18, 0))), nearSide, mask);
    expect(mid.eclipseCover).toBeGreaterThan(0.99);
    expect(mid.fraction).toBeLessThan(0.01);
    expect(before.eclipseCover).toBe(0);
  });
  it("a site that cannot see the Sun is unaffected (fraction stays 0)", () => {
    const far: Site = { id: "far", name: "Far side", latDeg: 0, lonDeg: 180 };
    const st = sunStatus(moonState(new Date(Date.UTC(2025, 2, 14, 6, 58))), far, mask);
    expect(st.fraction).toBe(0);
  });
  it("a sweep over the eclipse reports hours of eclipse, and illumination below the lit fraction", () => {
    const t0 = Date.UTC(2025, 2, 14, 0, 0);
    const [r] = sweep([{ site: nearSide, mask }], t0, t0 + 24 * 3_600_000, 5 * 60_000);
    expect(r.eclipseHours).toBeGreaterThan(2);
    expect(r.eclipseHours).toBeLessThan(8);
    expect(r.eclipseWindows).toHaveLength(1);
    expect(r.illumination).toBeLessThan(r.litFraction);
  });
});

describe("DSN stations", () => {
  const state = moonState(new Date(Date.UTC(2026, 10, 14, 12, 0)));
  const stations = stationStates(state);
  it("places each station within one Earth radius of the Earth's centre, as seen from the Moon", () => {
    const earthDist = Math.hypot(...state.earthKm);
    for (const s of stations) {
      const d = Math.hypot(...s.posKm);
      expect(Math.abs(d - earthDist)).toBeLessThan(6400);
    }
  });
  it("three complexes ~120° apart give the Moon above the 10° keep-out at one of them nearly all the time", () => {
    let up = 0;
    const N = 24 * 28;
    for (let i = 0; i < N; i++) {
      const st = moonState(new Date(Date.UTC(2026, 10, 1) + i * 3_600_000));
      if (stationStates(st).some((s) => s.moonElDeg >= STATION_MIN_MOON_ELEVATION_DEG)) up++;
    }
    expect(up / N).toBeGreaterThan(0.95);
  });
  it("the Moon is high at one station and low or set at its antipodal side", () => {
    const els = stations.map((s) => s.moonElDeg);
    expect(Math.max(...els)).toBeGreaterThan(Math.min(...els) + 20);
  });
  it("a link needs both ends: site sees the station AND the station sees the Moon", () => {
    const site: Site = { id: "c", name: "centre", latDeg: 0, lonDeg: 0 };
    const d = dsnStatus(state, site, flatHorizon());
    for (const s of d.stations) {
      expect(s.linked).toBe(s.siteSeesStation && s.stationSeesMoon);
    }
    expect(d.linked).toBe(d.stations.some((s) => s.linked));
    if (d.best) expect(d.best.linked).toBe(true);
  });
  it("the station list is the three DSN complexes", () => {
    expect(DSN_STATIONS.map((s) => s.id)).toEqual(["goldstone", "madrid", "canberra"]);
  });
});

describe("station vs Earth-centre visibility near the horizon", () => {
  it("a rim just above Earth's centre can still leave a station in view (peer-review gap 3)", () => {
    // Uniform rim 0.3° above the Earth's CENTRE at each instant. The centre test says "blocked", but the Earth's
    // disc spans up to ±0.95° from the Moon, so some station can sit higher than the rim and still see the Moon.
    const site: Site = { id: "sp", name: "Pole", latDeg: -89.9, lonDeg: 0 };
    let stationOnly = 0;
    let centreOnly = 0;
    for (let i = 0; i < 24 * 28; i++) {
      const st = moonState(new Date(Date.UTC(2026, 10, 1) + i * 3_600_000));
      const centreEl = lookAngles(st.earthKm, site).elDeg;
      const mask = new Float32Array(1440).fill(centreEl + 0.3);
      const d = dsnStatus(st, site, mask);
      const centreVisible = centreEl > centreEl + 0.3; // false by construction
      if (!centreVisible && d.linked) stationOnly++;
      if (centreVisible && !d.linked) centreOnly++;
    }
    expect(stationOnly).toBeGreaterThan(0);
    expect(centreOnly).toBe(0);
  });
});
