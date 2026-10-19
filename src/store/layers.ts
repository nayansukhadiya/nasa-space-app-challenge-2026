"use client";

import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { coversSouth, layerById } from "@/lib/layerCatalog";
import { blendOverlay, loadPolarOverlay, loadWorldOverlay, zoomFor } from "@/terrain/layerTiles";
import { useWorld } from "./world";

export type LayerStatus = "idle" | "loading" | "ready" | "error";
export type LayerPhase = "world" | "detail" | "wide";

interface LayersState {
  /** Moon Trek layer id drawn over the base imagery, or null for just the base map. */
  activeId: string | null;
  opacity: number;
  status: LayerStatus;
  phase: LayerPhase | null;
  done: number;
  total: number;
  /** The layer over the whole Moon (4096 × 2048), over the 600 km pole map and over the 60°S map. Null until loaded. */
  world: HTMLCanvasElement | null;
  detail: HTMLCanvasElement | null;
  wide: HTMLCanvasElement | null;
  setActive: (id: string | null) => void;
  setOpacity: (v: number) => void;
}

let token = 0;
const POLAR_PX = 1024;

export const useLayers = create<LayersState>((set) => ({
  activeId: null,
  opacity: 0.8,
  status: "idle",
  phase: null,
  done: 0,
  total: 0,
  world: null,
  detail: null,
  wide: null,

  setOpacity: (opacity) => set({ opacity }),

  setActive(id) {
    const my = ++token;
    const layer = layerById(id);
    set({ activeId: layer ? layer.id : null, world: null, detail: null, wide: null, done: 0, total: 0, phase: null, status: layer ? "loading" : "idle" });
    if (!layer) return;
    const cancelled = () => my !== token;
    const progress = (phase: LayerPhase) => (done: number, total: number) => {
      if (!cancelled()) set({ phase, done, total });
    };
    void (async () => {
      try {
        set({ phase: "world" });
        const world = await loadWorldOverlay(layer, progress("world"), cancelled);
        if (cancelled()) return;
        set({ world: world.canvas });

        // The polar maps only need the layer if it has data near the pole.
        const w = useWorld.getState();
        if (coversSouth(layer)) {
          // Equirectangular tiles are short and wide near the pole, so zoom 5 (≈ 0.7 km of latitude per pixel, 128 tiles)
          // already matches what a 1,024-px map of the pole can show; zoom 6 would need ~4× the tiles for no visible gain.
          if (w.map) {
            const r = await loadPolarOverlay(layer, w.map.meta.extentKm, POLAR_PX, zoomFor(layer, 5), progress("detail"), cancelled);
            if (cancelled()) return;
            set({ detail: r.canvas });
          }
          if (w.wideMap) {
            const r = await loadPolarOverlay(layer, w.wideMap.meta.extentKm, POLAR_PX, zoomFor(layer, 4), progress("wide"), cancelled);
            if (cancelled()) return;
            set({ wide: r.canvas });
          }
        }
        if (!cancelled()) set({ status: "ready", phase: null });
      } catch {
        if (!cancelled()) set({ status: "error", phase: null });
      }
    })();
  },
}));

/** Opacity that settles 120 ms after the slider stops, so dragging does not re-blend 4096-px canvases every frame. */
function useSettled(value: number, ms = 120): number {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The imagery canvas the scene should draw: NASA's base map with the active data layer blended over it at the chosen
 * opacity, or just the base map. `kind` picks the whole Moon, the 600 km pole map or the 60°S map.
 */
export function useBlendedCanvas(kind: "global" | "detail" | "wide"): HTMLCanvasElement | null {
  const base = useWorld((s) => (kind === "global" ? s.imageryGlobal.canvas : kind === "detail" ? s.imagery.canvas : s.imageryWide.canvas));
  const overlay = useLayers((s) => (kind === "global" ? s.world : kind === "detail" ? s.detail : s.wide));
  const opacity = useSettled(useLayers((s) => s.opacity));
  return useMemo(() => (base && overlay ? blendOverlay(base, overlay, opacity) : base), [base, overlay, opacity]);
}
