"use client";

import { useEffect, useRef } from "react";
import { type FrameMode, SUBTABS, type TabId, type ViewMode, useSim } from "@/store/sim";
import { useLayers } from "@/store/layers";
import { useWorld } from "@/store/world";
import { layerById } from "./layerCatalog";

const VIEWS: ViewMode[] = ["3d", "2d", "ground"];
const FRAMES: FrameMode[] = ["pole", "cap", "globe"];
// Every tab the store knows about, so a new tab can never be silently dropped from shared links.
const TABS = Object.keys(SUBTABS) as TabId[];

/** ISO time without milliseconds, e.g. 2026-11-14T00:00:00Z */
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Shareable URL state: view, frame, tab, time, selected site and probe point live in the query string, and
 * opening such a link restores them. `?synthetic` and any other params are left alone.
 */
export function useUrlState(): void {
  const status = useWorld((s) => s.status);
  // The URL is only written after the link has been read back, or an early state change (before the terrain finishes
  // loading) would overwrite the shared link with defaults and lose it.
  const restored = useRef(false);

  // Restore once the world is ready.
  useEffect(() => {
    if (status === "loading") return;
    const q = new URLSearchParams(window.location.search);
    const sim = useSim.getState();
    const view = q.get("view") as ViewMode | null;
    const frame = q.get("frame") as FrameMode | null;
    const tab = q.get("tab") as TabId | null;
    const t = q.get("t");
    const site = q.get("site");
    const probe = q.get("probe");
    const layer = q.get("layer");
    if (layer && layerById(layer)) useLayers.getState().setActive(layer);
    if (view && VIEWS.includes(view)) sim.setView(view);
    if (frame && FRAMES.includes(frame)) sim.setFrame(frame);
    if (tab && TABS.includes(tab)) sim.setTab(tab);
    if (t) {
      const ms = /^\d+$/.test(t) ? Number(t) : Date.parse(t);
      if (!Number.isNaN(ms)) {
        const day = 86_400_000;
        sim.setWindow(ms - 20 * day, ms + 30 * day, ms);
      }
    }
    if (site && useWorld.getState().sites[site]) {
      sim.selectSite(site);
      if (useWorld.getState().missions.some((m) => m.id === site)) {
        sim.selectMission(site);
        sim.setFocus(site);
      }
    }
    if (probe) {
      const [lat, lon] = probe.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) {
        void useWorld
          .getState()
          .addSite({ id: "probe", name: "Probe", latDeg: lat, lonDeg: lon })
          .then(() => useSim.getState().selectSite("probe"));
      }
    }
    restored.current = true;
  }, [status]);

  // Keep the URL in step (throttled), without adding history entries.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const write = () => {
      if (!restored.current) return;
      const s = useSim.getState();
      const q = new URLSearchParams(window.location.search);
      q.set("view", s.view);
      q.set("frame", s.frame);
      q.set("tab", s.tab);
      q.set("t", iso(s.tMs));
      const lay = useLayers.getState().activeId;
      if (lay) q.set("layer", lay);
      else q.delete("layer");
      const probeEntry = useWorld.getState().sites.probe;
      if (s.selectedSiteId === "probe" && probeEntry) {
        q.delete("site");
        q.set("probe", `${probeEntry.site.latDeg},${probeEntry.site.lonDeg}`);
      } else {
        q.delete("probe");
        if (s.selectedSiteId) q.set("site", s.selectedSiteId);
      }
      window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
    };
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(write, 600);
    };
    const unsub = useSim.subscribe(onChange);
    const unsubLayers = useLayers.subscribe(onChange);
    return () => {
      unsub();
      unsubLayers();
      clearTimeout(timer);
    };
  }, []);
}
