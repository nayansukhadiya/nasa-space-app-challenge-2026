import { useMemo } from "react";
import { useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import type { HeightSource } from "@/terrain/heightmap";
import { surfacePoint } from "./frame";
import { buildGrid } from "./graticule";

export interface MarkerItem {
  id: string;
  /** "site" markers are clickable; "label" items are passive grid annotations. */
  kind: "site" | "label";
  name: string;
  /** Scene position (km). */
  pos: [number, number, number];
}

/**
 * Hand-off between React (renders the marker DOM) and the R3F frame loop
 * (projects each marker to screen space and writes `transform` directly, so
 * panning/orbiting never triggers a React render).
 */
export const markerBus: { items: MarkerItem[]; els: Map<string, HTMLElement> } = {
  items: [],
  els: new Map(),
};

/** Sites that lie on the loaded DEM, placed on its surface. Off-map sites are listed elsewhere. */
export function useMarkerItems(map: HeightSource | null): MarkerItem[] {
  const sites = useWorld((s) => s.sites);
  const k = useSim((s) => s.exaggeration);
  const grid = useSim((s) => s.grid);
  return useMemo(() => {
    if (!map) return [];
    const out: MarkerItem[] = [];
    for (const { site } of Object.values(sites)) {
      const h = map.heightAtLatLon(site.latDeg, site.lonDeg);
      if (Number.isNaN(h)) continue;
      out.push({ id: site.id, kind: "site", name: site.name, pos: [...surfacePoint(site.latDeg, site.lonDeg, h, k)] as MarkerItem["pos"] });
    }
    buildGrid(map, grid, k).labels.forEach((l, i) => out.push({ id: `grid-${i}`, kind: "label", name: l.text, pos: l.pos }));
    return out;
  }, [sites, map, k, grid]);
}
