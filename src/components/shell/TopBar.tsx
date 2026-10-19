"use client";

import { Gauge, Orbit, Rocket, SatelliteDish, Sun } from "lucide-react";
import type { ComponentType } from "react";
import { fmtUtc } from "@/lib/format";
import { useSim, type TabId } from "@/store/sim";
import { Glass } from "../ui";

const TABS: Array<{ id: TabId; label: string; Icon: ComponentType<{ size?: number }>; hint: string }> = [
  { id: "illumination", label: "Illumination", Icon: Sun, hint: "Sunlight, shadows and solar power at a site" },
  { id: "comms", label: "Earth Contact", Icon: SatelliteDish, hint: "Can a station on Earth hear this site, and how well" },
  { id: "environment", label: "Environment", Icon: Gauge, hint: "Gravity, radiation and landing-region spread" },
  { id: "relay", label: "Relay", Icon: Orbit, hint: "A relay satellite that links the site to Earth" },
  { id: "missions", label: "Missions", Icon: Rocket, hint: "Past and planned missions: jump to their site and date" },
];

function Clock() {
  const tMs = useSim((s) => s.tMs);
  const playing = useSim((s) => s.playing);
  return (
    <div className="sw-clock" title={new Date(tMs).toISOString()}>
      <span className="sw-live" aria-hidden />
      <b>{fmtUtc(tMs)}</b>
      <span>{playing ? "LIVE" : "HOLD"}</span>
    </div>
  );
}

/** Brand, the five views (icon + name), the simulation clock and a jump to real "now". */
export function TopBar() {
  const tab = useSim((s) => s.tab);
  const { setTab } = useSim.getState();
  const goNow = () => {
    const now = Date.now();
    const s = useSim.getState();
    s.setPlaying(false);
    s.setWindow(now - 14 * 86_400_000, now + 76 * 86_400_000, now);
  };
  return (
    <header className="sw2-top">
      <div className="sw2-brand">
        <Glass className="sw2-brand-card">
          {/* Aetrova brand */}
          <div className="sw2-brand-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/aetrova.svg" alt="Aetrova" />
            <a href="https://nayansukhadiya.in" target="_blank" rel="noreferrer" className="sw2-by">
              by
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/n-logo.png" alt="" />
              <span>Nayan Sukhadiya</span>
            </a>
          </div>
          <div className="sw2-brand-name">
            <b>SouthWatch</b>
            <span>Lunar mission control</span>
          </div>
        </Glass>
      </div>

      <nav className="sw2-tabs" aria-label="Views">
        {TABS.map(({ id, label, Icon, hint }) => (
          <button
            key={id}
            type="button"
            className={`sw2-tab ${tab === id ? "on" : ""}`}
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            title={hint}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sw2-top-right">
        <Clock />
        <button type="button" className="sw2-now" onClick={goNow} title="Jump the simulation to the real current time">
          Now
        </button>
      </div>
    </header>
  );
}
