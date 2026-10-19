import { create } from "zustand";
import type { GravityModel } from "@/workers/terrain.worker";

export type ViewMode = "3d" | "2d" | "ground";
export type FrameMode = "pole" | "cap" | "globe";
export type SurfaceMode = "imagery" | "relief";
export type GridMode = "latlon" | "km" | "off";
export type RailPanel = "sites" | "layers";
export type TabId = "illumination" | "comms" | "missions" | "relay" | "environment";

/** Sub-tab ids per main tab: each panel shows ONE of these at a time so nothing is crowded. */
export const SUBTABS: Record<TabId, Array<{ id: string; label: string }>> = {
  illumination: [
    { id: "overview", label: "Overview" },
    { id: "sun", label: "Sun" },
    { id: "power", label: "Power" },
    { id: "horizon", label: "Horizon" },
  ],
  comms: [
    { id: "contact", label: "Contact" },
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
  environment: [
    { id: "gravity", label: "Gravity" },
    { id: "shield", label: "Shield" },
    { id: "region", label: "Region" },
    { id: "facts", label: "Facts" },
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
  /** Google/Apple-maps style focus: camera flown here, other markers dimmed. Null = overview. */
  focusedSiteId: string | null;
  relayId: string;
  /** How relay orbits are propagated: analytic two-body, lunar gravity, or lunar gravity + Earth/Sun. */
  gravityModel: GravityModel;
  view: ViewMode;
  tab: TabId;
  subTabs: Record<TabId, string>;
  surface: SurfaceMode;
  grid: GridMode;
  /** "pole": 600 km detail window; "cap": the 60°S–pole context map; "globe": the whole Moon. */
  frame: FrameMode;
  leftOpen: boolean;
  layersOpen: boolean;
  /** Which flyout the left icon rail has open (null = none). */
  railPanel: RailPanel | null;
  /** Is the bottom Time & visibility chart expanded (true) or just its control row (false)? */
  dockOpen: boolean;
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
  setFocus: (id: string | null) => void;
  /** Select + focus in one step (mission click). */
  focusOn: (siteId: string | null, missionId?: string | null) => void;
  clearFocus: () => void;
  setRelayId: (id: string) => void;
  setGravityModel: (m: GravityModel) => void;
  setView: (v: ViewMode) => void;
  setTab: (t: TabId) => void;
  setSubTab: (tab: TabId, id: string) => void;
  setFrame: (f: FrameMode) => void;
  setSurface: (s: SurfaceMode) => void;
  setGrid: (g: GridMode) => void;
  setExaggeration: (k: number) => void;
  setLeftOpen: (o: boolean) => void;
  setLayersOpen: (o: boolean) => void;
  setRailPanel: (p: RailPanel | null) => void;
  setDockOpen: (o: boolean) => void;
}

/** Default start: the first day of the hackathon. */
export const DEFAULT_START_MS = Date.UTC(2026, 10, 14, 0, 0, 0);

export const useSim = create<SimState>((set, get) => ({
  tMs: DEFAULT_START_MS,
  playing: false,
  speedIdx: 2,
  selectedSiteId: "south-pole",
  selectedMissionId: null,
  focusedSiteId: null,
  relayId: "polar-elliptical-12h",
  gravityModel: "moon+earth",
  view: "3d",
  tab: "illumination",
  subTabs: { illumination: "overview", comms: "contact", missions: "brief", relay: "status", environment: "gravity" },
  surface: "imagery",
  grid: "latlon",
  frame: "globe",
  leftOpen: true,
  layersOpen: false,
  railPanel: null,
  dockOpen: true,
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
  setFocus: (focusedSiteId) => set({ focusedSiteId }),
  focusOn: (siteId, missionId) =>
    set((s) => ({
      selectedSiteId: siteId ?? s.selectedSiteId,
      selectedMissionId: missionId !== undefined ? missionId : s.selectedMissionId,
      focusedSiteId: siteId,
    })),
  clearFocus: () => set({ focusedSiteId: null }),
  setRelayId: (relayId) => set({ relayId }),
  setGravityModel: (gravityModel) => set({ gravityModel }),
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
  setSubTab: (tab, id) => set({ subTabs: { ...get().subTabs, [tab]: id } }),
  setFrame: (frame) => set({ frame }),
  setSurface: (surface) => set({ surface }),
  setGrid: (grid) => set({ grid }),
  setExaggeration: (exaggeration) => set({ exaggeration }),
  setLeftOpen: (leftOpen) => set({ leftOpen }),
  setLayersOpen: (layersOpen) => set({ layersOpen }),
  setRailPanel: (railPanel) => set({ railPanel }),
  setDockOpen: (dockOpen) => set({ dockOpen }),
}));
