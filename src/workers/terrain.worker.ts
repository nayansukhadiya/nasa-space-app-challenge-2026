import * as Comlink from "comlink";
import type { HorizonMask } from "@/astro/horizon";
import { type RelayOrbit, type RelayWindows, relayWindows } from "@/astro/relay";
import type { Site } from "@/astro/site";
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
  horizon(latDeg: number, lonDeg: number): { mask: HorizonMask; source: HorizonSource } | null {
    if (!map) return null;
    try {
      const mask = computeHorizon(map, latDeg, lonDeg);
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
