"use client";

import { House, Layers, MapPin, X } from "lucide-react";
import { useMemo } from "react";
import { fmtLat, fmtLon } from "@/lib/format";
import { SOURCES } from "@/lib/sources";
import { cameraBus } from "@/scene/cameraBus";
import { type GridMode, type RailPanel, type SurfaceMode, useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { Glass } from "../ui";
import { Slider } from "../ui/slider";
import { Segmented } from "./controls";

function SitesPanel() {
  const sites = useWorld((s) => s.sites);
  const selected = useSim((s) => s.selectedSiteId);
  const list = useMemo(
    () => Object.values(sites).sort((a, b) => (a.site.id === "south-pole" ? -1 : b.site.id === "south-pole" ? 1 : a.site.name.localeCompare(b.site.name))),
    [sites],
  );
  return (
    <ul className="sw2-sitelist">
      {list.map((e) => (
        <li key={e.site.id}>
          <button
            type="button"
            className={selected === e.site.id ? "on" : ""}
            onClick={() => {
              useSim.getState().focusOn(e.site.id, e.mission ? e.site.id : undefined);
              useSim.getState().setRailPanel(null);
            }}
          >
            <MapPin size={14} />
            <span>
              <b>{e.site.name}</b>
              <small>
                {fmtLat(e.site.latDeg)} {fmtLon(e.site.lonDeg)}
                {e.mission ? " · mission site" : ""}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function LayersPanel() {
  const surface = useSim((s) => s.surface);
  const grid = useSim((s) => s.grid);
  const exaggeration = useSim((s) => s.exaggeration);
  const { setSurface, setGrid, setExaggeration } = useSim.getState();
  return (
    <div className="sw2-layers">
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
      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Relief exaggeration</span>
          <b>×{exaggeration}</b>
        </div>
        <Slider min={1} max={10} step={1} value={[exaggeration]} aria-label="Vertical exaggeration" onValueChange={([v]) => setExaggeration(v)} />
      </div>
      {exaggeration > 1 && <p className="sw-note">Scene only: shadows no longer match the numbers.</p>}
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
    </div>
  );
}

const ITEMS: Array<{ id: RailPanel; label: string; Icon: typeof MapPin; title: string }> = [
  { id: "sites", label: "Sites", Icon: MapPin, title: "Choose a site: the pole, mission sites and your probe" },
  { id: "layers", label: "Layers", Icon: Layers, title: "Map surface, grid, relief and data sources" },
];

/** Thin icon rail on the left. Each icon opens a small flyout, so the map stays clear until you ask for something. */
export function Rail() {
  const open = useSim((s) => s.railPanel);
  const { setRailPanel } = useSim.getState();
  return (
    <>
      <nav className="sw2-rail" aria-label="Tools">
        <button type="button" className="sw2-rail-btn" onClick={() => cameraBus.home()} title="Reset the camera" aria-label="Reset the camera">
          <House size={19} />
        </button>
        {ITEMS.map(({ id, Icon, title, label }) => (
          <button
            key={id}
            type="button"
            className={`sw2-rail-btn ${open === id ? "on" : ""}`}
            onClick={() => setRailPanel(open === id ? null : id)}
            title={title}
            aria-label={label}
            aria-expanded={open === id}
          >
            <Icon size={19} />
          </button>
        ))}
      </nav>
      {open && (
        <Glass className="sw2-flyout" as="aside" aria-label={open === "sites" ? "Sites" : "Layers and data"}>
          <div className="sw2-flyout-head">
            <span className="sw2-title">{open === "sites" ? "Sites" : "Layers & data"}</span>
            <button type="button" className="sw2-iconbtn" onClick={() => setRailPanel(null)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="sw2-scroll">{open === "sites" ? <SitesPanel /> : <LayersPanel />}</div>
        </Glass>
      )}
    </>
  );
}
