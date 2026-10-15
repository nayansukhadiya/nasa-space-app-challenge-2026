"use client";

import { useEffect, useState } from "react";
import { fmtLat, fmtLon } from "@/lib/format";
import { cameraBus } from "@/scene/cameraBus";
import { viewBus } from "@/scene/viewBus";
import { useSim } from "@/store/sim";

const Btn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" className="sw-nav-btn" onClick={onClick} aria-label={label} title={label}>
    {children}
  </button>
);

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/** Google-Earth-style navigation: home, zoom, tilt, turn. Smoothly animated, same camera as the mouse. */
export function NavControls() {
  const view = useSim((s) => s.view);
  if (view === "ground") {
    return (
      <div className="sw-nav sw-nav-ground" role="group" aria-label="Ground view controls">
        <span className="sw-label">Look at</span>
        <div className="sw-nav-chips">
          <button type="button" onClick={() => cameraBus.look("earth")}>
            Earth
          </button>
          <button type="button" onClick={() => cameraBus.look("sun")}>
            Sun
          </button>
          {(["n", "e", "s", "w"] as const).map((d) => (
            <button key={d} type="button" onClick={() => cameraBus.look(d)} aria-label={`Face ${d.toUpperCase()}`}>
              {d.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="sw-nav-group sw-nav-row">
          <Btn label="Zoom in" onClick={() => cameraBus.fov(0.8)}>
            <Icon d="M8 3v10M3 8h10" />
          </Btn>
          <Btn label="Zoom out" onClick={() => cameraBus.fov(1.25)}>
            <Icon d="M3 8h10" />
          </Btn>
        </div>
        <p className="sw-nav-hint">Drag to look around · wheel to zoom</p>
      </div>
    );
  }
  return (
    <div className="sw-nav" role="group" aria-label="Navigation">
      <Btn label="Reset view" onClick={() => cameraBus.home()}>
        <Icon d="M2.5 7.5 8 2.5l5.5 5M4 6.5v6.5h8V6.5" />
      </Btn>
      <div className="sw-nav-group">
        <Btn label="Zoom in" onClick={() => cameraBus.zoom(0.6)}>
          <Icon d="M8 3v10M3 8h10" />
        </Btn>
        <Btn label="Zoom out" onClick={() => cameraBus.zoom(1 / 0.6)}>
          <Icon d="M3 8h10" />
        </Btn>
      </div>
      <div className="sw-nav-group">
        <Btn label="Tilt toward the horizon" onClick={() => cameraBus.tilt(-0.22)}>
          <Icon d="M3 10.5 8 5.5l5 5" />
        </Btn>
        <Btn label="Tilt toward top-down" onClick={() => cameraBus.tilt(0.22)}>
          <Icon d="M3 5.5 8 10.5l5-5" />
        </Btn>
      </div>
      <div className="sw-nav-group">
        <Btn label="Turn left" onClick={() => cameraBus.turn(0.35)}>
          <Icon d="M10 3 5 8l5 5" />
        </Btn>
        <Btn label="Turn right" onClick={() => cameraBus.turn(-0.35)}>
          <Icon d="M6 3l5 5-5 5" />
        </Btn>
      </div>
    </div>
  );
}

const niceKm = (km: number): number => {
  const p = 10 ** Math.floor(Math.log10(km));
  const m = km / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
};

const fmtKm = (km: number): string => (km >= 1 ? `${Math.round(km).toLocaleString()} km` : `${Math.round(km * 1000)} m`);

/** Eye altitude, look-at point and a scale bar (the strip at the bottom of Google Earth). */
export function EyeReadout() {
  const [s, setS] = useState({ alt: 0, lat: -90, lon: 0, kmPerPx: 1, valid: false });
  useEffect(() => {
    const id = setInterval(
      () => setS({ alt: viewBus.eyeAltKm, lat: viewBus.latDeg, lon: viewBus.lonDeg, kmPerPx: viewBus.kmPerPx, valid: viewBus.valid }),
      200,
    );
    return () => clearInterval(id);
  }, []);
  const barKm = niceKm(s.kmPerPx * 90);
  const barPx = Math.max(10, Math.round(barKm / s.kmPerPx));
  return (
    <div className="sw-eye" aria-label="View readout">
      <span>
        <b>Eye</b> {fmtKm(s.alt)}
      </span>
      <span>
        {s.valid ? `${fmtLat(s.lat)} ${fmtLon(((s.lon + 540) % 360) - 180)}` : "—"}
      </span>
      <span className="sw-scale">
        <i style={{ width: barPx }} /> {fmtKm(barKm)}
      </span>
    </div>
  );
}
