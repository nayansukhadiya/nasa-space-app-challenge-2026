import { create } from "zustand";
import { type HorizonMask, flatHorizon } from "@/astro/horizon";
import type { Site } from "@/astro/site";
import { type Mission, type Orbiter, SOUTH_POLE, loadMissions, loadOrbiters, presetSites } from "@/lib/data";
import {
  CompositeHeightmap,
  type GlobalHeightmap,
  type HeightSource,
  type Heightmap,
  loadGlobalHeightmap,
  loadHeightmap,
} from "@/terrain/heightmap";
import { demoSyntheticHeightmap } from "@/terrain/synthetic";
import { loadGlobalImagery, loadPolarImagery } from "@/terrain/tiles";
import { terrainWorker } from "@/workers/client";
import type { HorizonSource } from "@/workers/terrain.worker";

export type TerrainStatus = "loading" | "ready" | "none";

export interface SiteEntry {
  site: Site;
  mission?: Mission;
  mask: HorizonMask;
  /** True when the mask came from a DEM; false means a flat horizon was assumed. */
  masked: boolean;
  /** Which dataset the horizon came from (sets its resolution). */
  source: HorizonSource | "none";
}

export interface ImageryState {
  status: "idle" | "loading" | "ready" | "error";
  canvas: HTMLCanvasElement | null;
  loaded: number;
  total: number;
}

const IDLE: ImageryState = { status: "idle", canvas: null, loaded: 0, total: 0 };

interface WorldState {
  imagery: ImageryState;
  imageryWide: ImageryState;
  imageryGlobal: ImageryState;
  /** Wide, coarser 60°S–pole context map (null if not generated). */
  wideMap: Heightmap | null;
  /** Whole-Moon 4 px/deg grid. */
  globalMap: GlobalHeightmap | null;
  /** Detail + wide + global: use for any height lookup or horizon. */
  terrain: HeightSource | null;
  status: TerrainStatus;
  map: Heightmap | null;
  synthetic: boolean;
  missions: Mission[];
  orbiters: Orbiter[];
  sites: Record<string, SiteEntry>;
  init: () => Promise<void>;
  /** Add (or replace) a user-chosen site and compute its horizon. */
  addSite: (site: Site) => Promise<void>;
}

const queryParams = () =>
  typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

async function buildEntry(site: Site, mission?: Mission): Promise<SiteEntry> {
  const res = await terrainWorker().horizon(site.latDeg, site.lonDeg);
  const heightKm = await terrainWorker().heightAt(site.latDeg, site.lonDeg);
  const withHeight: Site = Number.isNaN(heightKm) ? site : { ...site, heightKm };
  return res
    ? { site: withHeight, mission, mask: res.mask, masked: true, source: res.source }
    : { site, mission, mask: flatHorizon(), masked: false, source: "none" };
}

type ImageryKey = "imagery" | "imageryWide" | "imageryGlobal";

export const useWorld = create<WorldState>((set, get) => ({
  status: "loading",
  map: null,
  synthetic: false,
  missions: [],
  orbiters: [],
  sites: {},
  imagery: IDLE,
  imageryWide: IDLE,
  imageryGlobal: IDLE,
  wideMap: null,
  globalMap: null,
  terrain: null,

  async init() {
    const synthetic = queryParams().has("synthetic");
    const [missions, orbiters, map, wideMap, globalMap] = await Promise.all([
      loadMissions().catch(() => [] as Mission[]),
      loadOrbiters().catch(() => [] as Orbiter[]),
      synthetic ? Promise.resolve(demoSyntheticHeightmap()) : loadHeightmap(),
      synthetic ? Promise.resolve(null) : loadHeightmap("/data", "heightmap-wide"),
      synthetic ? Promise.resolve(null) : loadGlobalHeightmap(),
    ]);
    const terrain = map ? new CompositeHeightmap(map, wideMap, globalMap) : null;
    await terrainWorker().init({ baseUrl: "/data", synthetic });

    const sites: Record<string, SiteEntry> = {};
    const byId = new Map(missions.map((m) => [m.id, m]));
    for (const s of presetSites(missions)) sites[s.id] = await buildEntry(s, byId.get(s.id));
    if (!sites[SOUTH_POLE.id]) sites[SOUTH_POLE.id] = await buildEntry(SOUTH_POLE);

    set({ missions, orbiters, map, wideMap, globalMap, terrain, synthetic, sites, status: map ? "ready" : "none" });

    // Real NASA imagery drapes over the terrain. Synthetic relief is not lunar, so it never gets it.
    if (map && !synthetic) {
      const run = (key: ImageryKey, task: (cb: (d: number, t: number) => void) => ReturnType<typeof loadPolarImagery>) => {
        set({ [key]: { status: "loading", canvas: null, loaded: 0, total: 0 } } as Partial<WorldState>);
        task((done, total) => set({ [key]: { ...get()[key], status: "loading", loaded: done, total } } as Partial<WorldState>))
          .then((r) =>
            set({
              [key]: {
                status: r.tilesLoaded > 0 ? "ready" : "error",
                canvas: r.tilesLoaded > 0 ? r.canvas : null,
                loaded: r.tilesLoaded,
                total: r.tilesTotal,
              },
            } as Partial<WorldState>),
          )
          .catch(() => set({ [key]: { status: "error", canvas: null, loaded: 0, total: 0 } } as Partial<WorldState>));
      };
      // Whole Moon first (it is what you see at launch zoomed out), then the polar detail.
      if (globalMap) run("imageryGlobal", (cb) => loadGlobalImagery(3, cb));
      run("imagery", (cb) => loadPolarImagery(map.meta.extentKm, 2048, 5, cb));
      if (wideMap) run("imageryWide", (cb) => loadPolarImagery(wideMap.meta.extentKm, 2048, 4, cb));
    }
  },

  async addSite(site) {
    const entry = await buildEntry(site);
    set({ sites: { ...get().sites, [site.id]: entry } });
  },
}));
