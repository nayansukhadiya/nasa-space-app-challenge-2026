"use client";

import { ChevronDown, ExternalLink, Layers2, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DATA_LAYERS,
  LAYER_GROUPS,
  type DataLayer,
  layerById,
  layerCapabilitiesUrl,
  layerKmPerPx,
} from "@/lib/layerCatalog";
import { layerHasData } from "@/terrain/layerTiles";
import { useLayers } from "@/store/layers";
import { useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { Tag } from "../ui";
import { Slider } from "../ui/slider";

/** Plain words for where a layer has data. */
export function footprintText(l: DataLayer): string {
  const [, s, , n] = l.bbox;
  if (s <= -85 && n >= 85) return "Whole Moon";
  if (n <= -50) return `South pole, ${Math.abs(Math.round(n))}°S to the pole`;
  if (s >= 50) return `North, ${Math.round(s)}°N and up`;
  return `${Math.abs(Math.round(s))}°${s < 0 ? "S" : "N"} to ${Math.abs(Math.round(n))}°${n < 0 ? "S" : "N"}`;
}

export function resolutionText(l: DataLayer): string {
  const km = layerKmPerPx(l);
  return km >= 1 ? `~${km.toFixed(km >= 10 ? 0 : 1)} km per pixel` : `~${Math.round(km * 1000)} m per pixel`;
}

/**
 * The layer menu: the base map (imagery or plain relief) and every NASA data layer, grouped by what it tells you.
 * Picking a data layer drapes it over the terrain; the card under the map header explains it and sets the opacity.
 */
export function LayerPicker() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const activeId = useLayers((s) => s.activeId);
  const surface = useSim((s) => s.surface);
  const active = layerById(activeId);
  const { setActive } = useLayers.getState();
  const { setSurface } = useSim.getState();

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return LAYER_GROUPS.map((g) => ({
      ...g,
      items: DATA_LAYERS.filter(
        (l) => l.group === g.id && (needle === "" || `${l.title} ${l.instrument} ${l.blurb}`.toLowerCase().includes(needle)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [q]);

  const pick = (l: DataLayer | null, base?: "imagery" | "relief") => {
    if (base) setSurface(base);
    else if (l) setSurface("imagery"); // a data layer is drawn on the imagery canvas
    setActive(l ? l.id : null);
    setOpen(false);
  };

  return (
    <div className="sw2-layerwrap">
      <button
        type="button"
        className={`sw2-layerbtn ${active ? "on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="Choose a NASA data layer to draw on the map"
      >
        <Layers2 size={15} />
        <span className="sw2-layerbtn-label">Layer</span>
        <b>{active ? active.title : surface === "relief" ? "Relief shading" : "NASA imagery"}</b>
        <ChevronDown size={14} />
      </button>

      {open && (
        <aside className="sw-glass sw2-layerpanel" aria-label="Data layers">
          <div className="sw2-layerpanel-head">
            <label className="sw-search">
              <Search size={13} aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: temperature, iron, slope…" aria-label="Search layers" autoFocus />
            </label>
            <button type="button" className="sw2-iconbtn" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="sw2-scroll sw2-layerlist">
            <h5>Base map</h5>
            <button type="button" className={`sw2-layeritem ${!active && surface === "imagery" ? "on" : ""}`} onClick={() => pick(null, "imagery")}>
              <b>NASA imagery</b>
              <span>LRO photograph of the surface (the default)</span>
            </button>
            <button type="button" className={`sw2-layeritem ${!active && surface === "relief" ? "on" : ""}`} onClick={() => pick(null, "relief")}>
              <b>Relief shading</b>
              <span>Grey terrain lit by the real Sun, no photograph</span>
            </button>
            {groups.map((g) => (
              <div key={g.id}>
                <h5>{g.label}</h5>
                {g.items.map((l) => (
                  <button key={l.id} type="button" className={`sw2-layeritem ${activeId === l.id ? "on" : ""}`} onClick={() => pick(l)}>
                    <b>{l.title}</b>
                    <span>
                      {l.instrument} · {footprintText(l)}
                    </span>
                    <i className={`sw2-tagdot ${l.tag.toLowerCase()}`}>{l.tag}</i>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <p className="sw-note sw-pad">No layer matches. Try “temperature”, “iron” or “slope”.</p>}
          </div>
        </aside>
      )}
    </div>
  );
}

/** Under the map header: what the active layer is, where it has data, its source, and the opacity. */
export function LayerCard() {
  const activeId = useLayers((s) => s.activeId);
  const status = useLayers((s) => s.status);
  const phase = useLayers((s) => s.phase);
  const done = useLayers((s) => s.done);
  const total = useLayers((s) => s.total);
  const opacity = useLayers((s) => s.opacity);
  const { setOpacity, setActive } = useLayers.getState();
  const selectedId = useSim((s) => s.selectedSiteId);
  const site = useWorld((s) => (selectedId ? s.sites[selectedId]?.site : undefined));
  const l = layerById(activeId);
  if (!l) return null;
  const outside = site ? !layerHasData(l, site.latDeg, site.lonDeg) : false;
  const loading = status === "loading";

  return (
    <section className="sw-glass sw2-layercard" aria-label="Active data layer">
      <div className="sw2-layercard-top">
        <div>
          <span className="sw2-title">{LAYER_GROUPS.find((g) => g.id === l.group)?.label}</span>
          <h4>{l.title}</h4>
        </div>
        <div className="sw2-layercard-actions">
          <Tag kind={l.tag} />
          <button type="button" className="sw2-iconbtn" onClick={() => setActive(null)} aria-label="Remove the layer" title="Remove the layer">
            <X size={14} />
          </button>
        </div>
      </div>
      <p>{l.blurb}</p>
      <div className="sw2-layercard-meta">
        <span>{l.instrument}</span>
        <span>{footprintText(l)}</span>
        <span>{resolutionText(l)}</span>
        {l.units && <span>Unit: {l.units}</span>}
      </div>
      <label className="sw2-opacity">
        <span>Opacity</span>
        <Slider min={0.1} max={1} step={0.05} value={[opacity]} aria-label="Layer opacity" onValueChange={([v]) => setOpacity(v)} />
        <b>{Math.round(opacity * 100)}%</b>
      </label>
      {loading && (
        <div className="sw2-layerload" role="status">
          Loading {phase === "world" ? "the whole Moon" : phase === "detail" ? "the pole map" : "the 60°S map"}… {total ? `${done}/${total} tiles` : ""}
        </div>
      )}
      {status === "error" && <p className="sw-note sw-note-warn">NASA&apos;s tile service did not answer. Check your connection and pick the layer again.</p>}
      {outside && site && (
        <p className="sw-note sw-note-warn">
          {site.name} lies outside this layer&apos;s footprint ({footprintText(l)}), so nothing is drawn there.
        </p>
      )}
      <p className="sw-note">
        Colours are NASA&apos;s own: Moon Trek publishes no unit scale for this layer, so SouthWatch shows none it cannot prove.{" "}
        <a href={layerCapabilitiesUrl(l)} target="_blank" rel="noreferrer">
          Service <ExternalLink size={10} />
        </a>{" "}
        · Credit: {l.credit}; NASA Solar System Treks.
      </p>
    </section>
  );
}
