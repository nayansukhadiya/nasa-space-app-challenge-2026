"use client";

import { SOURCES } from "@/lib/sources";
import { useUrlState } from "@/lib/urlState";
import { SKY_CREDIT } from "@/scene/Sky";
import { markerBus, useMarkerItems } from "@/scene/markerBus";
import {
  useSim,
  type FrameMode,
  type GridMode,
  type SurfaceMode,
  type TabId,
} from "@/store/sim";
import { useWorld } from "@/store/world";
import { CompositeHeightmap } from "@/terrain/heightmap";
import { GLOBAL_TILE_SOURCE, TILE_SOURCE } from "@/terrain/tiles";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { MiniGlobe } from "./MiniGlobe";
import { MissionList } from "./MissionList";
import { EyeReadout, NavControls } from "./NavControls";
import { Scrubber } from "./Scrubber";
import { Telemetry } from "./Telemetry";
import { Glass } from "./ui";

// The WebGL canvas is browser-only; keep it out of the static prerender.
const MoonScene = dynamic(() => import("@/scene/MoonScene"), { ssr: false });

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "illumination", label: "Illumination" },
  { id: "comms", label: "Comms" },
  { id: "missions", label: "Missions" },
  { id: "relay", label: "Relay" },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; text: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sw-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`sw-seg-btn ${value === o.id ? "sw-seg-on" : ""}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function TopBar() {
  const tab = useSim((s) => s.tab);
  const view = useSim((s) => s.view);
  const frame = useSim((s) => s.frame);
  const { setTab, setView, setFrame } = useSim.getState();
  return (
    <header className="sw-top">
      <div className="sw-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}

        <Glass className="flex w-fit max-w-[calc(100vw-1rem)] items-center gap-3 p-2">
          {/* Aetrova brand */}
          <div className="flex w-[min(42vw,168px)] shrink-0 flex-col gap-1 justify-center">
            <img
              src="/logo/logo.svg"
              alt="Aetrova"
              className="block h-auto max-h-10 p-2 w-full object-contain"
            />
            <div className="flex items-center justify-center gap-1">
              by
              {/* Personal portfolio identity */}
              <a
                href="https://nayansukhadiya.in"
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-1.5"
              >
                <img
                  src="/logo/n-logo.png"
                  alt="Nayan Sukhadiya portfolio logo"
                  className="h-7 w-7 shrink-0 object-contain"
                />

                <span className="min-w-0 truncate text-[11px] font-medium text-white/85 hover:text-cyan-400">
                  Nayan Sukhadiya
                </span>
              </a>
            </div>
          </div>

          {/* SouthWatch mission identity */}
          <div className="min-w-0 border-l border-white/15 pl-3">
            <div className="whitespace-nowrap text-sm font-bold tracking-tight text-white sm:text-base">
              SouthWatch
            </div>
            <div className="whitespace-nowrap text-[9px] uppercase tracking-[0.12em] text-white/45">
              Lunar mission control
            </div>
          </div>
        </Glass>
      </div>
      <nav className="sw-tabs" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`sw-tab ${tab === t.id ? "sw-tab-on" : ""}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="sw-top-right">
        <Segmented<FrameMode>
          label="Frame"
          value={frame}
          options={[
            { id: "pole", text: "Pole" },
            { id: "cap", text: "60°S" },
            { id: "globe", text: "Moon" },
          ]}
          onChange={setFrame}
        />
        <Segmented<"3d" | "2d" | "ground">
          label="Map view"
          value={view}
          options={[
            { id: "3d", text: "3D" },
            { id: "2d", text: "2D" },
            { id: "ground", text: "Ground" },
          ]}
          onChange={setView}
        />
      </div>
    </header>
  );
}

function MarkerOverlay() {
  const terrain = useWorld((s) => s.terrain);
  const items = useMarkerItems(terrain);
  const selected = useSim((s) => s.selectedSiteId);
  const select = useSim((s) => s.selectSite);
  const view = useSim((s) => s.view);
  useEffect(() => {
    markerBus.items = view === "ground" ? [] : items;
  }, [items, view]);

  const register = (id: string) => (el: HTMLDivElement | null) => {
    if (el) markerBus.els.set(id, el);
    else markerBus.els.delete(id);
  };

  return (
    <div className="sw-markers" aria-label="Site markers">
      {(view === "ground" ? [] : items).map((m) =>
        m.kind === "label" ? (
          <div key={m.id} ref={register(m.id)} className="sw-marker-anchor">
            <span className="sw-gridlabel">{m.name}</span>
          </div>
        ) : (
          <div key={m.id} ref={register(m.id)} className="sw-marker-anchor">
            <button
              type="button"
              onClick={() => select(m.id)}
              className={`sw-marker ${selected === m.id ? "sw-marker-on" : ""}`}
            >
              <span className="sw-marker-dot" />
              <span className="sw-marker-label">{m.name}</span>
            </button>
          </div>
        ),
      )}
    </div>
  );
}

/** Layers: collapsed to one button, so the stage stays clear. */
function Layers() {
  const open = useSim((s) => s.layersOpen);
  const surface = useSim((s) => s.surface);
  const grid = useSim((s) => s.grid);
  const exaggeration = useSim((s) => s.exaggeration);
  const { setLayersOpen, setSurface, setGrid, setExaggeration } =
    useSim.getState();
  return (
    <div className="sw-layers">
      {open && (
        <Glass className="sw-layers-panel">
          <div className="sw-layer-row">
            <span>Surface</span>
            <Segmented<SurfaceMode>
              label="Surface"
              value={surface}
              options={[
                { id: "imagery", text: "Imagery" },
                { id: "relief", text: "Relief" },
              ]}
              onChange={setSurface}
            />
          </div>
          <div className="sw-layer-row">
            <span>Grid</span>
            <Segmented<GridMode>
              label="Grid"
              value={grid}
              options={[
                { id: "latlon", text: "Lat/lon" },
                { id: "km", text: "km" },
                { id: "off", text: "Off" },
              ]}
              onChange={setGrid}
            />
          </div>
          <div className="sw-layer-row">
            <span>Relief ×{exaggeration}</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={exaggeration}
              aria-label="Vertical exaggeration"
              onChange={(e) => setExaggeration(Number(e.target.value))}
            />
          </div>
          {exaggeration > 1 && (
            <p className="sw-note">
              Scene only: shadows no longer match the telemetry.
            </p>
          )}
          <h4 className="sw-sub">Data sources</h4>
          <ul className="sw-sources">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <span>{s.what}</span>
                <a href={s.href} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
                <em>{s.licence}</em>
              </li>
            ))}
          </ul>
        </Glass>
      )}
      <button
        type="button"
        className="sw-layers-btn"
        onClick={() => setLayersOpen(!open)}
        aria-expanded={open}
      >
        Layers
      </button>
    </div>
  );
}

function StageOverlay() {
  const status = useWorld((s) => s.status);
  const synthetic = useWorld((s) => s.synthetic);
  const map = useWorld((s) => s.map);
  const imagery = useWorld((s) => s.imagery);
  const imageryGlobal = useWorld((s) => s.imageryGlobal);

  return (
    <>
      <MarkerOverlay />
      {status === "none" && (
        <div className="sw-banner" role="status">
          <strong>No terrain data loaded.</strong> Run{" "}
          <code>pipeline/dem.py</code>. Horizon blocking is not modelled without
          it.
        </div>
      )}
      {synthetic && (
        <div className="sw-banner" role="status">
          <strong>Synthetic terrain</strong>: invented relief for development.
          Not lunar data.
        </div>
      )}
      <Layers />
      <NavControls />
      <EyeReadout />
      <div className="sw-attrib">
        {map && (
          <a href={SOURCES[0].href} target="_blank" rel="noreferrer">
            Terrain · NASA LOLA
          </a>
        )}
        {map && !synthetic && (
          <a href={SOURCES[2].href} target="_blank" rel="noreferrer">
            Imagery · NASA Moon Trek
            {imagery.status === "loading" || imageryGlobal.status === "loading"
              ? " · loading…"
              : ""}
            {imagery.status === "error" ? " · unreachable" : ""}
          </a>
        )}
        <a href={SOURCES[3].href} target="_blank" rel="noreferrer">
          {SKY_CREDIT}
        </a>
        <a href={SOURCES[4].href} target="_blank" rel="noreferrer">
          Earth · NASA Blue Marble
        </a>
        <span className="sw-attrib-hide">
          {GLOBAL_TILE_SOURCE + TILE_SOURCE}
        </span>
      </div>
    </>
  );
}

export default function Dashboard() {
  useUrlState();
  const init = useWorld((s) => s.init);
  const status = useWorld((s) => s.status);
  const terrain = useWorld((s) => s.terrain);
  const sites = useWorld((s) => s.sites);
  const selectedSiteId = useSim((s) => s.selectedSiteId);
  useEffect(() => {
    void init();
  }, [init]);

  // Selecting a site that lies outside the polar maps zooms out to a frame that shows it.
  useEffect(() => {
    const e = selectedSiteId ? sites[selectedSiteId] : null;
    if (!e || !(terrain instanceof CompositeHeightmap)) return;
    const src = terrain.sourceAt(e.site.latDeg, e.site.lonDeg);
    const { frame, setFrame } = useSim.getState();
    if (src === "wide" && frame === "pole") setFrame("cap");
    if (src === "global" && frame !== "globe") setFrame("globe");
  }, [selectedSiteId, sites, terrain]);

  return (
    <div className="sw-app">
      <div className="sw-stage">
        {status === "loading" ? (
          <div className="sw-loading">LOADING TERRAIN…</div>
        ) : (
          <MoonScene />
        )}
        <StageOverlay />
      </div>
      <TopBar />
      <div className="sw-left">
        <MissionList />
      </div>
      <div className="sw-right">
        <MiniGlobe />
        <Telemetry />
      </div>
      <Scrubber />
    </div>
  );
}
