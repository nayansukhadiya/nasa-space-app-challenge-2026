"use client";

import { useMemo } from "react";
import { moonStateAt } from "@/astro/cache";
import { BANDS, fsplDb, lightTimeUnits } from "@/astro/comms";
import { RELAY_PRESETS, relayLink } from "@/astro/relay";
import { panelIrradiance } from "@/astro/solar";
import { fmtDeg, fmtDuration, fmtLat, fmtLon, fmtMinutes, fmtUtc } from "@/lib/format";
import { useSelectedEntry, useTelemetry, useThrottledT } from "@/lib/hooks";
import { useRelayWindows } from "@/lib/useRelay";
import { useSweep } from "@/lib/useSweep";
import { thumbUrl } from "@/lib/data";
import { SUBTABS, useSim } from "@/store/sim";
import { type SiteEntry, useWorld } from "@/store/world";
import { Dossier } from "./Dossier";
import { Panorama } from "./Panorama";
import { TimelineChart } from "./TimelineChart";
import { Flag, Glass, Stat, SubTabs, Tag } from "./ui";

const YEAR_START = Date.UTC(2026, 0, 1);
const YEAR_END = Date.UTC(2027, 0, 1);

const SOURCE_LABEL: Record<SiteEntry["source"], string> = {
  detail: "LOLA 391 m",
  wide: "LOLA 1 km",
  global: "LOLA 7.6 km · coarse",
  synthetic: "SYNTHETIC",
  none: "FLAT HORIZON",
};

function terrainNote(e: SiteEntry, synthetic: boolean): { text: string; warn: boolean } {
  if (!e.masked) {
    return { text: "FLAT HORIZON assumed: this site is off every loaded map, so terrain blocking is not modelled.", warn: true };
  }
  if (synthetic) return { text: "SYNTHETIC terrain (dev mode): horizons come from invented relief.", warn: true };
  if (e.source === "global") {
    return {
      text: "Outside the polar maps, so the horizon uses the 7.6 km global grid. Small hills and crater walls are not resolved.",
      warn: true,
    };
  }
  return { text: "Horizon from real LOLA elevation data.", warn: false };
}

export function Telemetry() {
  const tab = useSim((s) => s.tab);
  const sub = useSim((s) => s.subTabs[s.tab]);
  const windowStartMs = useSim((s) => s.windowStartMs);
  const windowEndMs = useSim((s) => s.windowEndMs);
  const relayId = useSim((s) => s.relayId);
  const synthetic = useWorld((s) => s.synthetic);
  const orbiters = useWorld((s) => s.orbiters);
  const entry = useSelectedEntry();
  const tMs = useThrottledT();
  const tel = useTelemetry(entry, tMs);
  const win = useSweep(entry, windowStartMs, windowEndMs);
  const year = useSweep(entry, YEAR_START, YEAR_END);
  const orbit = RELAY_PRESETS.find((o) => o.id === relayId) ?? RELAY_PRESETS[0];
  const relay = useRelayWindows(tab === "relay" ? orbit : null, entry, tMs);

  const solar = useMemo(
    () => (tel ? panelIrradiance(tel.sun.rangeKm, tel.sun.elDeg, tel.sun.semiDiameterDeg, tel.sun.horizonDeg) : null),
    [tel],
  );

  if (tab === "missions") return <Dossier />;

  if (!entry || !tel || !solar) {
    return (
      <Glass className="sw-panel">
        <div className="sw-panel-head">
          <span className="sw-label">Site telemetry</span>
        </div>
        <p className="sw-note sw-pad">Click the Moon, or pick a mission, to read its sun, Earth and signal geometry.</p>
      </Glass>
    );
  }

  const { site } = entry;
  const yr = year.status === "done" ? year.result : null;
  const w = win.status === "done" ? win.result : null;
  const windowDays = Math.round((windowEndMs - windowStartMs) / 86_400_000);
  const lt = lightTimeUnits(tel.earth.rangeKm);
  const note = terrainNote(entry, synthetic);
  const setSub = (id: string) => useSim.getState().setSubTab(tab, id);

  let body: React.ReactNode = null;

  if (tab === "illumination" && sub === "sun") {
    body = (
      <>
        <div className="sw-grid2">
          <Stat
            label="Sun"
            value={tel.sun.lit ? "LIT" : "DARK"}
            tag="COMPUTED"
            status={tel.sun.lit}
            note={`disc ${(solar.discFraction * 100).toFixed(0)}% above horizon`}
          />
          <Stat
            label="Elevation"
            value={fmtDeg(tel.sun.elDeg)}
            tag="COMPUTED"
            note={`horizon ${fmtDeg(tel.sun.horizonDeg)} @ az ${tel.sun.azDeg.toFixed(0)}°`}
          />
          <Stat
            label="Lit in 2026"
            value={yr ? (yr.litFraction * 100).toFixed(1) : "…"}
            unit={yr ? "%" : undefined}
            tag="COMPUTED"
            note="upper limb above horizon"
          />
          <Stat
            label="Longest dark"
            value={yr ? fmtDuration(yr.longestDarkHours) : "…"}
            tag="COMPUTED"
            note="continuous, in 2026"
          />
        </div>
      </>
    );
  } else if (tab === "illumination" && sub === "power") {
    body = (
      <>
        <div className="sw-grid2">
          <Stat
            label="Sun-facing panel"
            value={Math.round(solar.sunFacing)}
            unit="W/m²"
            tag="MODELED"
            note="uniform disc, no limb darkening"
          />
          <Stat label="Flat on ground" value={solar.flat.toFixed(0)} unit="W/m²" tag="MODELED" note="× sin(elevation)" />
          <Stat
            label="Disc visible"
            value={(solar.discFraction * 100).toFixed(0)}
            unit="%"
            tag="COMPUTED"
            note="area above terrain horizon"
          />
          <Stat
            label={`Lit, ${windowDays} d window`}
            value={w ? (w.litFraction * 100).toFixed(1) : "…"}
            unit={w ? "%" : undefined}
            tag="COMPUTED"
            note="seasonal: Sun swings ±1.5° a year"
          />
        </div>
        <p className="sw-note">A model for scale, not a mission figure.</p>
      </>
    );
  } else if (tab === "illumination") {
    body = (
      <>
        <Panorama entry={entry} tMs={tMs} />
        <TimelineChart entry={entry} tMs={tMs} kind="sun" />
        <p className="sw-note">Above the dashed line the Sun is up. The teal line is the simulation time.</p>
      </>
    );
  } else if (tab === "comms" && sub === "link") {
    body = (
      <div className="sw-grid2">
        <Stat
          label="Earth in view"
          value={tel.earth.visible ? "YES" : tel.earth.partial ? "PART" : "NO"}
          tag="COMPUTED"
          status={tel.earth.visible}
          note={`el ${fmtDeg(tel.earth.elDeg)} · horizon ${fmtDeg(tel.earth.horizonDeg)}`}
        />
        <Stat
          label="Signal, one way"
          value={lt.ms.toFixed(1)}
          unit="ms"
          tag="COMPUTED"
          note={`${lt.s.toFixed(4)} s · ${lt.min.toFixed(5)} min`}
        />
        <Stat label="Round trip" value={(lt.ms * 2).toFixed(0)} unit="ms" tag="COMPUTED" note={`${(lt.s * 2).toFixed(3)} s`} />
        <Stat
          label="Distance"
          value={Math.round(tel.earth.rangeKm).toLocaleString()}
          unit="km"
          tag="COMPUTED"
          note={`bearing ${tel.earth.azDeg.toFixed(0)}° from north`}
        />
        <Stat
          label="Earth visible, 2026"
          value={yr ? (yr.earthVisibleFraction * 100).toFixed(1) : "…"}
          unit={yr ? "%" : undefined}
          tag="COMPUTED"
          note="direct line of sight"
        />
        <Stat
          label={`Visible, ${windowDays} d window`}
          value={w ? (w.earthVisibleFraction * 100).toFixed(1) : "…"}
          unit={w ? "%" : undefined}
          tag="COMPUTED"
        />
      </div>
    );
  } else if (tab === "comms" && sub === "bands") {
    body = (
      <>
        <table className="sw-table">
          <thead>
            <tr>
              <th>Band</th>
              <th>Nominal</th>
              <th>Path loss</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{b.ghz} GHz</td>
                <td>{fsplDb(tel.earth.rangeKm, b.ghz).toFixed(1)} dB</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sw-note">
          <Tag kind="COMPUTED" /> geometric free-space loss at the live distance. No antennas, atmosphere or pointing;
          bands are nominal centres, not attributed to any mission.
        </p>
      </>
    );
  } else if (tab === "comms") {
    body = (
      <>
        <Panorama entry={entry} tMs={tMs} />
        <TimelineChart entry={entry} tMs={tMs} kind="earth" />
      </>
    );
  } else if (tab === "relay" && sub === "status") {
    const link = relayLink(orbit, site, entry.mask, tMs, moonStateAt(tMs).earthKm);
    body = (
      <>
        <div className="sw-grid2">
          <Stat
            label="Site sees relay"
            value={link.siteSeesRelay ? "YES" : "NO"}
            tag="MODELED"
            status={link.siteSeesRelay}
            note={`el ${fmtDeg(link.elDeg)} · ${Math.round(link.rangeKm).toLocaleString()} km`}
          />
          <Stat
            label="Relay sees Earth"
            value={link.relaySeesEarth ? "YES" : "NO"}
            tag="MODELED"
            status={link.relaySeesEarth}
            note={`altitude ${Math.round(link.altitudeKm).toLocaleString()} km`}
          />
          <Stat
            label="Relayed link, 48 h"
            value={relay.status === "done" ? (relay.windows.linkedFraction * 100).toFixed(0) : "…"}
            unit={relay.status === "done" ? "%" : undefined}
            tag="MODELED"
            note="site → relay → Earth"
          />
          <Stat
            label="Any path, 48 h"
            value={relay.status === "done" ? (relay.windows.anyFraction * 100).toFixed(0) : "…"}
            unit={relay.status === "done" ? "%" : undefined}
            tag="MODELED"
            note={`direct only ${relay.status === "done" ? (relay.windows.directFraction * 100).toFixed(0) : "…"}%`}
          />
        </div>
      </>
    );
  } else if (tab === "relay" && sub === "passes") {
    const upcoming =
      relay.status === "done" ? relay.windows.siteSeesRelay.filter(([, b]) => b > tMs).slice(0, 4) : [];
    const linkedAt = (a: number, b: number) =>
      relay.status === "done" && relay.windows.linked.some(([x, y]) => x < b && y > a);
    body = (
      <table className="sw-table">
        <thead>
          <tr>
            <th>Rise (UTC)</th>
            <th>Set</th>
            <th>Length</th>
            <th>Earth</th>
          </tr>
        </thead>
        <tbody>
          {upcoming.map(([a, b]) => (
            <tr key={a}>
              <td>{fmtUtc(Math.max(a, tMs)).slice(5, 16)}</td>
              <td>{fmtUtc(b).slice(11, 16)}</td>
              <td>{fmtMinutes((b - a) / 60_000)}</td>
              <td>{linkedAt(a, b) ? "YES" : "no"}</td>
            </tr>
          ))}
          {relay.status === "done" && upcoming.length === 0 && (
            <tr>
              <td colSpan={4}>No pass in the next 48 h.</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  } else {
    body = (
      <>
        <label className="sw-field">
          <span>Orbit (generic concepts, not any real mission)</span>
          <select value={relayId} onChange={(e) => useSim.getState().setRelayId(e.target.value)}>
            {RELAY_PRESETS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <p className="sw-note">{orbit.note} Two-body Kepler only: no mascons, no third bodies.</p>
        <Panorama entry={entry} tMs={tMs} relay={orbit} />
        {orbiters.length > 0 && (
          <>
            <h4 className="sw-sub">Real lunar orbiters</h4>
            <div className="sw-orbiters">
              {orbiters.map((o) => (
                <figure key={o.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl(o.image.src, 330)} alt={o.name} loading="lazy" referrerPolicy="no-referrer" />
                  <figcaption>
                    <b>{o.name}</b>
                    <span>
                      <Flag code={o.country} /> {o.agency}
                    </span>
                    <a href={o.image.href} target="_blank" rel="noreferrer">
                      {o.image.credit?.split(".")[0].slice(0, 28)} · {o.image.license}
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
      </>
    );
  }

  const title =
    tab === "illumination" ? "Illumination" : tab === "comms" ? "Comms" : tab === "relay" ? "Relay simulation" : "";

  return (
    <Glass className="sw-panel">
      <div className="sw-panel-head">
        <div>
          <span className="sw-label">{title}</span>
          <h3 className="sw-site">{site.name}</h3>
          <div className="sw-coord">
            {fmtLat(site.latDeg)} {fmtLon(site.lonDeg)}
            {site.heightKm !== undefined ? ` · ${site.heightKm.toFixed(2)} km` : ""}
          </div>
        </div>
        <span className={`sw-chip-src ${note.warn ? "warn" : ""}`} title={note.text}>
          {SOURCE_LABEL[entry.source]}
        </span>
      </div>
      <SubTabs tabs={SUBTABS[tab]} value={sub} onChange={setSub} />
      <div className="sw-panel-body">
        {note.warn && <p className="sw-note sw-note-warn">{note.text}</p>}
        {body}
      </div>
    </Glass>
  );
}
