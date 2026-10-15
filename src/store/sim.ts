import { create } from "zustand";

export type ViewMode = "3d" | "2d" | "ground";
export type FrameMode = "pole" | "cap" | "globe";
export type SurfaceMode = "imagery" | "relief";
export type GridMode = "latlon" | "km" | "off";
export type TabId = "illumination" | "comms" | "missions" | "relay";

/** Sub-tab ids per main tab: each panel shows ONE of these at a time so nothing is crowded. */
export const SUBTABS: Record<TabId, Array<{ id: string; label: string }>> = {
  illumination: [
    { id: "sun", label: "Sun" },
    { id: "power", label: "Power" },
    { id: "horizon", label: "Horizon" },
  ],
  comms: [
    { id: "link", label: "Link" },
    { id: "bands", label: "Bands" },
    { id: "view", label: "View" },
  ],
  missions: [
    { id: "brief", label: "Brief" },
    { id: "images", label: "Images" },
    { id: "facts", label: "Facts" },
  ],
  relay: [
    { id: "status", label: "Status" },
    { id: "passes", label: "Passes" },
    { id: "orbit", label: "Orbit" },
  ],
};

export const PLAY_SPEEDS = [
  { label: "1×", simSecPerSec: 1 },
  { label: "1 min/s", simSecPerSec: 60 },
  { label: "1 h/s", simSecPerSec: 3600 },
  { label: "6 h/s", simSecPerSec: 6 * 3600 },
  { label: "1 d/s", simSecPerSec: 86_400 },
  { label: "3 d/s", simSecPerSec: 3 * 86_400 },
] as const;

interface SimState {
  /** Simulation clock, UTC epoch milliseconds. */
  tMs: number;
  playing: boolean;
  speedIdx: number;
  selectedSiteId: string | null;
  selectedMissionId: string | null;
  relayId: string;
  view: ViewMode;
  tab: TabId;
  subTabs: Record<TabId, string>;
  surface: SurfaceMode;
  grid: GridMode;
  /** "pole": 600 km detail window; "cap": the 60°S–pole context map; "globe": the whole Moon. */
  frame: FrameMode;
  leftOpen: boolean;
  layersOpen: boolean;
  /** Scrubber range, UTC epoch ms. */
  windowStartMs: number;
  windowEndMs: number;
  /** Vertical exaggeration applied to terrain meshes only (telemetry is always true-scale). */
  exaggeration: number;
  setT: (tMs: number) => void;
  setWindow: (startMs: number, endMs: number, tMs?: number) => void;
  advance: (realDtSec: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeedIdx: (i: number) => void;
  selectSite: (id: string | null) => void;
  selectMission: (id: string | null) => void;
  setRelayId: (id: string) => void;
  setView: (v: ViewMode) => void;
  setTab: (t: TabId) => void;
  setSubTab: (tab: TabId, id: string) => void;
  setFrame: (f: FrameMode) => void;
  setSurface: (s: SurfaceMode) => void;
  setGrid: (g: GridMode) => void;
  setExaggeration: (k: number) => void;
  setLeftOpen: (o: boolean) => void;
  setLayersOpen: (o: boolean) => void;
}

/** Default start: the first day of the hackathon. */
export const DEFAULT_START_MS = Date.UTC(2026, 10, 14, 0, 0, 0);

export const useSim = create<SimState>((set, get) => ({
  tMs: DEFAULT_START_MS,
  playing: false,
  speedIdx: 2,
  selectedSiteId: "south-pole",
  selectedMissionId: null,
  relayId: "polar-elliptical-12h",
  view: "3d",
  tab: "illumination",
  subTabs: { illumination: "sun", comms: "link", missions: "brief", relay: "status" },
  surface: "imagery",
  grid: "latlon",
  frame: "globe",
  leftOpen: true,
  layersOpen: false,
  exaggeration: 1,
  windowStartMs: DEFAULT_START_MS - 14 * 86_400_000,
  windowEndMs: DEFAULT_START_MS + 76 * 86_400_000,
  setT: (tMs) => set({ tMs }),
  setWindow: (windowStartMs, windowEndMs, tMs) =>
    set({ windowStartMs, windowEndMs, ...(tMs === undefined ? {} : { tMs }) }),
  advance: (dt) => set({ tMs: get().tMs + dt * PLAY_SPEEDS[get().speedIdx].simSecPerSec * 1000 }),
  setPlaying: (playing) => set({ playing }),
  setSpeedIdx: (speedIdx) => set({ speedIdx }),
  selectSite: (selectedSiteId) => set({ selectedSiteId }),
  selectMission: (selectedMissionId) => set({ selectedMissionId }),
  setRelayId: (relayId) => set({ relayId }),
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  setSubTab: (tab, id) => set({ subTabs: { ...get().subTabs, [tab]: id } }),
  setFrame: (frame) => set({ frame }),
  setSurface: (surface) => set({ surface }),
  setGrid: (grid) => set({ grid }),
  setExaggeration: (exaggeration) => set({ exaggeration }),
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setLayersOpen: (layersOpen) => set({ layersOpen }),
}));
