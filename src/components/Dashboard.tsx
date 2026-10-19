"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { SOURCES } from "@/lib/sources";
import { useUrlState } from "@/lib/urlState";
import { SKY_CREDIT } from "@/scene/Sky";
import { markerBus, useMarkerItems } from "@/scene/markerBus";
import { useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { CompositeHeightmap } from "@/terrain/heightmap";
import { GLOBAL_TILE_SOURCE, TILE_SOURCE } from "@/terrain/tiles";
import { MiniGlobe } from "./MiniGlobe";
import { EyeReadout, NavControls } from "./NavControls";
import { Telemetry } from "./Telemetry";
import { LayerCard } from "./shell/LayerPicker";
import { MapHeader } from "./shell/MapHeader";
import { Rail } from "./shell/Rail";
import { TimeVisibility } from "./shell/TimeVisibility";
import { TopBar } from "./shell/TopBar";

// The WebGL canvas is browser-only; keep it out of the static prerender.
const MoonScene = dynamic(() => import("@/scene/MoonScene"), { ssr: false });

function MarkerOverlay() {
  const terrain = useWorld((s) => s.terrain);
  const items = useMarkerItems(terrain);
  const selected = useSim((s) => s.selectedSiteId);
  const focused = useSim((s) => s.focusedSiteId);
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
          <div key={m.id} ref={register(m.id)} className={`sw-marker-anchor ${focused ? "sw-marker-dim" : ""}`}>
            <span className="sw-gridlabel">{m.name}</span>
          </div>
        ) : (
          <div key={m.id} ref={register(m.id)} className="sw-marker-anchor">
            <button
              type="button"
              onClick={() => useSim.getState().focusOn(m.id)}
              className={`sw-marker ${selected === m.id ? "sw-marker-on" : ""} ${
                focused && focused !== m.id ? "sw-marker-dim" : ""
              } ${m.id === "probe" ? "sw-marker-sim" : ""}`}
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

function FocusBanner() {
  const focused = useSim((s) => s.focusedSiteId);
  const sites = useWorld((s) => s.sites);
  if (!focused) return null;
  const entry = sites[focused];
  return (
    <div className="sw-focus" role="status">
      <span className="sw-live" aria-hidden />
      <span className="sw-focus-name">{entry ? entry.site.name : focused}</span>
      <span className="sw-focus-sub">focused · others dimmed</span>
      <button type="button" className="sw-mini-btn" onClick={() => useSim.getState().clearFocus()}>
        Back to overview (Esc)
      </button>
    </div>
  );
}

/** Flies the camera whenever focus or frame settles (frame change resets the rig, so re-fly after it). */
function FocusFlyer() {
  const focused = useSim((s) => s.focusedSiteId);
  const frame = useSim((s) => s.frame);
  const sites = useWorld((s) => s.sites);
  useEffect(() => {
    if (!focused) return;
    const entry = sites[focused];
    if (!entry) return;
    const id = window.setTimeout(() => {
      import("@/scene/cameraBus").then(({ cameraBus }) => cameraBus.flyTo(entry.site.latDeg, entry.site.lonDeg));
    }, 60);
    return () => window.clearTimeout(id);
  }, [focused, frame, sites]);
  // Esc clears focus (and any open flyout) like closing a Maps pin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useSim.getState();
      if (s.railPanel) s.setRailPanel(null);
      else s.clearFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
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
      <FocusBanner />
      {status === "none" && (
        <div className="sw-banner" role="status">
          <strong>No terrain data loaded.</strong> Run <code>pipeline/dem.py</code>. Horizon blocking is not modelled without it.
        </div>
      )}
      {synthetic && (
        <div className="sw-banner" role="status">
          <strong>Synthetic terrain</strong>: invented relief for development. Not lunar data.
        </div>
      )}
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
            {imagery.status === "loading" || imageryGlobal.status === "loading" ? " · loading…" : ""}
            {imagery.status === "error" ? " · unreachable" : ""}
          </a>
        )}
        <a href={SOURCES[3].href} target="_blank" rel="noreferrer">
          {SKY_CREDIT}
        </a>
        <a href={SOURCES[4].href} target="_blank" rel="noreferrer">
          Earth · NASA Blue Marble
        </a>
        <span className="sw-attrib-hide">{GLOBAL_TILE_SOURCE + TILE_SOURCE}</span>
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
  const dockOpen = useSim((s) => s.dockOpen);
  useEffect(() => {
    void init();
  }, [init]);

  // On short screens the chart starts collapsed so the map and the panel keep their room.
  useEffect(() => {
    if (window.innerHeight < 720) useSim.getState().setDockOpen(false);
  }, []);

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
    <div className={`sw-app ${dockOpen ? "" : "sw2-dock-min"}`}>
      <FocusFlyer />
      <div className="sw-stage">
        {status === "loading" ? <div className="sw-loading">LOADING TERRAIN…</div> : <MoonScene />}
        <StageOverlay />
      </div>
      <TopBar />
      <Rail />
      <MapHeader />
      <LayerCard />
      <aside className="sw2-right">
        <Telemetry />
      </aside>
      <div className="sw2-inset">
        <MiniGlobe />
      </div>
      <TimeVisibility />
    </div>
  );
}
