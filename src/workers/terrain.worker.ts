import * as Comlink from "comlink";
import type { HorizonMask } from "@/astro/horizon";
import { DEGREE2_FIELD, type GravityField, POINT_MASS_FIELD } from "@/astro/gravity";
import { keplerToStateEqj, positionFixed, propagate } from "@/astro/orbit";
import { type RelayOrbit, type RelayWindows, relayPositionFixed, relayWindows, relayWindowsFrom } from "@/astro/relay";
import type { Site } from "@/astro/site";
import { type Spread, diskGrid, offsetLatLon, spread } from "@/astro/stats";
import { type SweepResult, sweep } from "@/astro/sweep";
import {
  CompositeHeightmap,
  type HeightSource,
  loadGlobalHeightmap,
  loadHeightmap,
} from "@/terrain/heightmap";
import { computeHorizon } from "@/terrain/horizonCompute";
import { demoSyntheticHeightmap } from "@/terrain/synthetic";

let map: HeightSource | null = null;
let composite: CompositeHeightmap | null = null;
/** Lunar gravity used by the numerical orbits: the full GRAIL field when one has been loaded, else degree 2. */
let gravity: GravityField = DEGREE2_FIELD;

export type GravityModel = "two-body" | "moon" | "moon+earth";
const forcesFor = (m: GravityModel) => ({
  field: m === "two-body" ? POINT_MASS_FIELD : gravity,
  earth: m === "moon+earth",
  sun: m === "moon+earth",
});

export interface RegionStats {
  /** Grid points evaluated (those that fell on a loaded map). */
  points: number;
  illumination: Spread;
  dsnFraction: Spread;
  /** Per-point values for a histogram or map overlay. */
  samples: Array<{ latDeg: number; lonDeg: number; illumination: number; dsn: number }>;
}

export type HorizonSource = "detail" | "wide" | "global" | "synthetic";

const api = {
  /** Load the DEMs inside the worker. Returns provenance, or null when there is no terrain. */
  async init(opts: { baseUrl: string; synthetic: boolean }): Promise<{ source: string; synthetic: boolean } | null> {
    if (opts.synthetic) {
      const m = demoSyntheticHeightmap();
      map = m;
      composite = null;
      return { source: m.meta.source, synthetic: true };
    }
    const [detail, wide, global] = await Promise.all([
      loadHeightmap(opts.baseUrl),
      loadHeightmap(opts.baseUrl, "heightmap-wide"),
      loadGlobalHeightmap(opts.baseUrl),
    ]);
    composite = detail ? new CompositeHeightmap(detail, wide, global) : null;
    map = composite;
    return detail ? { source: detail.meta.source, synthetic: false } : null;
  },

  /**
   * Horizon mask for a site plus which dataset it was computed from (so the UI can state the resolution),
   * or null when no terrain is loaded or the site is off every map.
   */
  horizon(latDeg: number, lonDeg: number, observerKm = 0): { mask: HorizonMask; source: HorizonSource } | null {
    if (!map) return null;
    try {
      // observerKm = antenna / panel height above the ground (peer-review gap 15: a mast sees past rims an eye does not)
      const mask = computeHorizon(map, latDeg, lonDeg, { observerHeightKm: observerKm });
      const source: HorizonSource = composite ? (composite.sourceAt(latDeg, lonDeg) as HorizonSource) : "synthetic";
      return { mask, source };
    } catch {
      return null;
    }
  },

  /** Height of the DEM under a lat/lon (km), NaN if outside. */
  heightAt(latDeg: number, lonDeg: number): number {
    return map ? map.heightAtLatLon(latDeg, lonDeg) : Number.NaN;
  },

  /** MODELED relay passes for one site over [startMs, endMs). */
  relay(orbit: RelayOrbit, site: Site, mask: HorizonMask, startMs: number, endMs: number, stepMs: number): RelayWindows {
    return relayWindows(orbit, site, mask, startMs, endMs, stepMs);
  },

  /** Replace the lunar gravity field used by `relayNumeric` (e.g. the GRAIL field fetched by the page). */
  setGravity(field: GravityField): void {
    gravity = field;
  },

  /**
   * MODELED relay passes with the orbit integrated numerically under lunar gravity (degree 2 or the full GRAIL
   * field) and, optionally, Earth and Sun as third bodies. Also returns how far the real orbit has drifted from the
   * two-body one at the end of the span: the size of the error a Kepler relay makes.
   */
  relayNumeric(
    orbit: RelayOrbit,
    site: Site,
    mask: HorizonMask,
    startMs: number,
    endMs: number,
    stepMs: number,
    model: GravityModel,
  ): { windows: RelayWindows; driftKm: number; field: string } {
    // Start on the Kepler orbit at the window start, then let real gravity act. 30 s steps resolve the fastest
    // (500 km) orbit; the span is capped so a far-future scrub cannot freeze the worker.
    const spanS = Math.min(30 * 86_400, Math.max(60, (endMs - startMs) / 1000 + 60));
    const tr = propagate(keplerToStateEqj(orbit, startMs), startMs, spanS, 30, forcesFor(model));
    const windows = relayWindowsFrom((t) => positionFixed(tr, t), site, mask, startMs, endMs, stepMs);
    const kep = relayPositionFixed(orbit, endMs - 30_000);
    const num = positionFixed(tr, endMs - 30_000);
    const driftKm = Math.hypot(kep[0] - num[0], kep[1] - num[1], kep[2] - num[2]);
    return { windows, driftKm, field: model === "two-body" ? POINT_MASS_FIELD.name : gravity.name };
  },

  /**
   * Landing-REGION statistics: a grid of points inside a disc, each with its own 0.25° horizon, swept at hourly
   * steps (peer-review gap 6). Nobody lands on a point: a ridge-top can be far better lit than ground 200 m away.
   */
  region(
    latDeg: number,
    lonDeg: number,
    radiusKm: number,
    spacingKm: number,
    startMs: number,
    endMs: number,
  ): RegionStats | null {
    const m = map;
    if (!m) return null;
    const sites: Array<{ site: Site; mask: HorizonMask }> = [];
    for (const { eastKm, northKm } of diskGrid(radiusKm, spacingKm)) {
      const [la, lo] = offsetLatLon(latDeg, lonDeg, eastKm, northKm);
      try {
        const mask = computeHorizon(m, la, lo);
        const h = m.heightAtLatLon(la, lo);
        sites.push({ site: { id: `${la.toFixed(4)},${lo.toFixed(4)}`, name: "grid", latDeg: la, lonDeg: lo, heightKm: h }, mask });
      } catch {
        // off every map: skip this grid point
      }
    }
    if (sites.length === 0) return null;
    const res = sweep(sites, startMs, endMs, 3_600_000);
    const samples = res.map((r, i) => ({
      latDeg: sites[i].site.latDeg,
      lonDeg: sites[i].site.lonDeg,
      illumination: r.illumination,
      dsn: r.dsnFraction,
    }));
    return {
      points: samples.length,
      illumination: spread(samples.map((x) => x.illumination)),
      dsnFraction: spread(samples.map((x) => x.dsn)),
      samples,
    };
  },

  sweep(
    entries: Array<{ site: Site; mask: HorizonMask }>,
    startMs: number,
    endMs: number,
    stepMs: number,
    onProgress?: (f: number) => void,
  ): SweepResult[] {
    return sweep(entries, startMs, endMs, stepMs, onProgress);
  },
};

export type TerrainWorkerApi = typeof api;
Comlink.expose(api);
