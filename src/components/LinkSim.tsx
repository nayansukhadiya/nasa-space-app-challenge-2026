"use client";

import { useMemo } from "react";
import { horizonDistanceKm } from "@/astro/gravity";
import { horizonElevationDeg } from "@/astro/horizon";
import { RELAY_PRESETS } from "@/astro/relay";
import { fmtDeg } from "@/lib/format";
import { useSelectedEntry, useThrottledT } from "@/lib/hooks";
import { type LiveLink, computeLink } from "@/lib/linkCalc";
import { useMastMask } from "@/lib/useMastMask";
import { BAND_PRESETS, useLink } from "@/store/link";
import { useSim } from "@/store/sim";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Glass, Stat, Tag } from "./ui";

/** Frequency control: preset band buttons + fine slider (user sets the TX and RX carriers). */
function FreqControl({
  label,
  value,
  onChange,
  field,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  field: "up" | "down";
}) {
  return (
    <div className="sw-relief-row">
      <div className="sw-relief-head">
        <span>{label}</span>
        <b>{value.toFixed(2)} GHz</b>
      </div>
      <Slider min={0.5} max={40} step={0.01} value={[value]} aria-label={label} onValueChange={([v]) => onChange(v)} />
      <div className="sw-chips" style={{ padding: 0 }}>
        {BAND_PRESETS.map((b) => (
          <button key={b.name} type="button" className="sw-chip" onClick={() => onChange(field === "up" ? b.up : b.down)}>
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const fmtHz = (hz: number): string =>
  Math.abs(hz) >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(1)} Hz`;

/** Received carrier, GHz, after the kinematic Doppler and the relativistic clock shift. */
const received = (nominalGHz: number, dopplerHz: number, relHz: number): string =>
  (nominalGHz + (dopplerHz + relHz) / 1e9).toFixed(9);

function stateOf(live: LiveLink): { label: string; variant: "accent" | "default" | "warn" } {
  if (!live.available) return { label: "BLOCKED · COMPUTED", variant: "default" };
  if (live.down.locked && live.up.locked) return { label: "LOCKED · COMPUTED", variant: "accent" };
  return { label: "NO LOCK · COMPUTED", variant: "warn" };
}

/**
 * Moon → Earth link simulation. The probe (selected site) sits on a mast whose height the user sets; the horizon is
 * re-marched from the top of that mast, the link is budgeted to the real DSN station that can hear it, and every
 * frequency shift (Doppler from Earth's spin and the Moon's orbit, plus the relativistic clock rate) is shown.
 * Shared by the top-right widget (`compact`) and the Comms tab.
 */
export function LinkSim({ compact = false }: { compact?: boolean }) {
  const entry = useSelectedEntry();
  const tMs = useThrottledT(500);
  const link = useLink();
  const relayId = useSim((s) => s.relayId);
  const orbit = RELAY_PRESETS.find((o) => o.id === relayId) ?? null;
  const { mask, pending } = useMastMask(entry, link.mastM);

  const live = useMemo(
    () =>
      entry && mask ? computeLink(entry.site, mask, link, tMs, link.path === "relay" ? orbit : null) : null,
    [entry, mask, link, tMs, orbit],
  );

  if (!entry || !live || !mask) {
    return (
      <Glass className="sw-active" as="section" aria-label="Link simulation">
        <span className="sw-label">Moon → Earth sim</span>
        <p className="sw-note">Click the Moon to drop the SIM probe, then run the beam test.</p>
      </Glass>
    );
  }

  const st = stateOf(live);
  const locked = live.available && live.down.locked && live.up.locked;
  const groundH = horizonElevationDeg(entry.mask, live.earthAzDeg);
  const mastH = horizonElevationDeg(mask, live.earthAzDeg);

  return (
    <Glass className="sw-active" as="section" aria-label="Moon to Earth simulation">
      <div className="sw-active-top">
        <span className="sw-label">Moon → Earth sim</span>
        <Badge variant={st.variant}>{st.label}</Badge>
      </div>

      <div className={`sw-beam ${link.running && live.available ? "sw-beam-on" : ""}`} aria-hidden>
        <span className="sw-beam-dot moon" />
        <span className="sw-beam-line" style={live.available ? undefined : { opacity: 0.25 }}>
          <i />
          <i />
          <i />
        </span>
        <span className="sw-beam-dot earth" />
      </div>
      <div className="sw-coord">
        {(live.lightTimeMs / 1000).toFixed(4)} s one-way · {Math.round(live.pathKm).toLocaleString()} km ·{" "}
        {live.station ? `via ${live.station.name}` : "no station in view"}
      </div>

      <div className="sw-grid2" style={{ marginTop: 8 }}>
        <Stat
          label="Down margin"
          value={live.down.marginDb.toFixed(1)}
          unit="dB"
          tag="COMPUTED"
          status={locked}
          note={`${link.downGHz.toFixed(2)} GHz · ${(link.downRateKbps / 1000).toFixed(1)} Mbps`}
        />
        <Stat
          label="Up margin"
          value={live.up.marginDb.toFixed(1)}
          unit="dB"
          tag="COMPUTED"
          note={`${link.upGHz.toFixed(2)} GHz · ${link.upRateKbps.toFixed(1)} kbps`}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <Button variant={link.running ? "default" : "accent"} size="sm" onClick={() => link.set({ running: !link.running })}>
          {link.running ? "Stop sim" : "Run sim test"}
        </Button>
        {!compact && (
          <Button variant="ghost" size="sm" onClick={() => link.set({ path: link.path === "direct" ? "relay" : "direct" })}>
            Path: {link.path}
          </Button>
        )}
      </div>

      {!compact && (
        <>
          <h4 className="sw-sub">Antenna mast</h4>
          <div className="sw-relief-row">
            <div className="sw-relief-head">
              <span>Height above ground</span>
              <b>{link.mastM.toFixed(1)} m</b>
            </div>
            <Slider min={0} max={50} step={0.5} value={[link.mastM]} aria-label="Mast height" onValueChange={([v]) => link.set({ mastM: v })} />
          </div>
          <p className="sw-note">
            Horizon toward Earth: {fmtDeg(groundH)} on the ground → {fmtDeg(mastH)} from the mast top
            {pending ? " (recomputing…)" : ""}. Sees {horizonDistanceKm(link.mastM / 1000).toFixed(1)} km to a flat
            horizon. <Tag kind="COMPUTED" />
          </p>

          <h4 className="sw-sub">Ground stations</h4>
          <table className="sw-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>Site sees</th>
                <th>Moon at stn</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {live.dsn.stations.map((s) => (
                <tr key={s.id} style={s.id === live.station?.id ? { color: "var(--accent)" } : undefined}>
                  <td>{s.name.split(",")[0]}</td>
                  <td>
                    {fmtDeg(s.elDeg)} / {fmtDeg(s.horizonDeg)}
                  </td>
                  <td>{fmtDeg(s.moonElAtStationDeg)}</td>
                  <td>{s.linked ? "LINK" : !s.siteSeesStation ? "rim" : "set"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sw-note">
            Needs the station above the site&apos;s skyline AND the Moon ≥ 10° over the station. Earth&apos;s disc spans
            ±0.95° from the Moon, so stations differ by up to a degree at the horizon. <Tag kind="COMPUTED" />
          </p>

          <h4 className="sw-sub">Carriers</h4>
          <FreqControl field="up" label="TX Earth → Moon" value={link.upGHz} onChange={(v) => link.set({ upGHz: v })} />
          <FreqControl field="down" label="RX Moon → Earth" value={link.downGHz} onChange={(v) => link.set({ downGHz: v })} />

          <table className="sw-table">
            <thead>
              <tr>
                <th />
                <th>Down</th>
                <th>Up</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Nominal</td>
                <td>{link.downGHz.toFixed(6)} GHz</td>
                <td>{link.upGHz.toFixed(6)} GHz</td>
              </tr>
              <tr>
                <td>Doppler</td>
                <td>{fmtHz(live.dopplerDownHz)}</td>
                <td>{fmtHz(live.dopplerUpHz)}</td>
              </tr>
              <tr>
                <td>Clock rate (GR)</td>
                <td>{fmtHz(live.relativisticDownHz)}</td>
                <td>{fmtHz(live.relativisticUpHz)}</td>
              </tr>
              <tr>
                <td>Received</td>
                <td>{received(link.downGHz, live.dopplerDownHz, live.relativisticDownHz)}</td>
                <td>{received(link.upGHz, live.dopplerUpHz, live.relativisticUpHz)}</td>
              </tr>
              <tr>
                <td>Air loss</td>
                <td>{live.atmosDownDb.toFixed(2)} dB</td>
                <td>{live.atmosUpDb.toFixed(2)} dB</td>
              </tr>
            </tbody>
          </table>
          <p className="sw-note">
            Doppler = −f·ṙ/c with ṙ = {live.rangeRateKmS.toFixed(3)} km/s to {live.station ? "the station" : "Earth's centre"}
            : mostly the Earth&apos;s spin. Clock rate: a lunar clock runs ~56 µs/day fast, shifting an 8.4 GHz carrier
            by ~5 Hz. Shapiro delay {(live.shapiroS * 1e9).toFixed(2)} ns. <Tag kind="COMPUTED" /> Air loss is{" "}
            <Tag kind="MODELED" /> (clear sky, no rain).
          </p>
          <p className="sw-note">
            SIMULATION inputs (not mission data): dishes {link.moonDishM.toFixed(1)} m / {link.earthDishM.toFixed(0)} m,
            rates, pointing. Free-space geometry plus the Earth&apos;s air only.
          </p>
        </>
      )}
    </Glass>
  );
}
