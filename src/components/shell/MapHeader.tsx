"use client";

import { Grid3x3, LocateFixed, Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";
import { type FrameMode, useSim } from "@/store/sim";
import { Segmented } from "./controls";
import { LayerPicker } from "./LayerPicker";

/** What you are looking at and how: which part of the Moon, 3D / 2D / ground, surface, grid, find-me, fullscreen. */
export function MapHeader() {
  const view = useSim((s) => s.view);
  const frame = useSim((s) => s.frame);
  const grid = useSim((s) => s.grid);
  const { setView, setFrame, setGrid } = useSim.getState();
  const [full, setFull] = useState(false);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const locate = () => {
    const s = useSim.getState();
    if (s.selectedSiteId) s.focusOn(s.selectedSiteId);
  };

  return (
    <div className="sw2-maphead" role="toolbar" aria-label="Map controls">
      <Segmented<FrameMode>
        label="Part of the Moon"
        value={frame}
        options={[
          { id: "pole", text: "Pole", title: "600 km around the south pole" },
          { id: "cap", text: "60°S", title: "Everything south of 60°S" },
          { id: "globe", text: "Moon", title: "The whole Moon" },
        ]}
        onChange={setFrame}
      />
      <Segmented<"3d" | "2d" | "ground">
        label="Map view"
        value={view}
        options={[
          { id: "3d", text: "3D", title: "Orbit the Moon" },
          { id: "2d", text: "2D", title: "Straight down, like a map" },
          { id: "ground", text: "Ground", title: "Stand on the site and look at the sky" },
        ]}
        onChange={setView}
      />
      <LayerPicker />
      <button
        type="button"
        className={`sw2-iconbtn ${grid !== "off" ? "on" : ""}`}
        onClick={() => setGrid(grid === "off" ? "latlon" : "off")}
        aria-pressed={grid !== "off"}
        title="Show or hide the grid"
        aria-label="Toggle grid"
      >
        <Grid3x3 size={16} />
      </button>
      <button type="button" className="sw2-iconbtn" onClick={locate} title="Fly to the selected site" aria-label="Fly to the selected site">
        <LocateFixed size={16} />
      </button>
      <button type="button" className="sw2-iconbtn" onClick={toggleFull} title={full ? "Leave full screen" : "Full screen"} aria-label="Full screen">
        {full ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
    </div>
  );
}
