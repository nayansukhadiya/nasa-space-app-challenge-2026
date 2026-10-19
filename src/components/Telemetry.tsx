"use client";

import { ArrowDownToLine, Eclipse, Moon, Mountain, Repeat, Route, Satellite, SatelliteDish, Sun, SunDim, Sunrise, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { moonStateAt } from "@/astro/cache";
import { BANDS, fsplDb } from "@/astro/comms";
import { RELAY_PRESETS, relayLink } from "@/astro/relay";
import { panelIrradiance } from "@/astro/solar";
import { fmtDeg, fmtDuration, fmtLat, fmtLon, fmtMinutes, fmtUtc } from "@/lib/format";
import { useSelectedEntry, useTelemetry, useThrottledT } from "@/lib/hooks";
import { useRelayWindows } from "@/lib/useRelay";
import { useSweep } from "@/lib/useSweep";
import { thumbUrl } from "@/lib/data";
import { SUBTABS, useSim } from "@/store/sim";
import type { GravityModel } from "@/workers/terrain.worker";
import { type SiteEntry, useWorld } from "@/store/world";
import { ContactPanel } from "./ContactPanel";
import { EnvironmentPanel } from "./EnvironmentPanel";
import { LinkSim } from "./LinkSim";
import { MissionsPanel } from "./MissionsPanel";
import { Overview } from "./Overview";
import { PowerSim } from "./PowerSim";
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
  const gravityModel = useSim((s) => s.gravityModel);
  const synthetic = useWorld((s) => s.synthetic);
  const orbiters = useWorld((s) => s.orbiters);
  const allSites = useWorld((s) => s.sites);
  const entry = useSelectedEntry();
  const tMs = useThrottledT();
  const tel = useTelemetry(entry, tMs);
  const win = useSweep(entry, windowStartMs, windowEndMs);
  const year = useSweep(entry, YEAR_START, YEAR_END);
  const orbit = RELAY_PRESETS.find((o) => o.id === relayId) ?? RELAY_PRESETS[0];
  const relay = useRelayWindows(tab === "relay" ? orbit : null, entry, tMs, gravityModel);

  const solar = useMemo(
    () =>
      tel
        ? panelIrradiance(tel.sun.rangeKm, tel.sun.elDeg, tel.sun.semiDiameterDeg, tel.sun.horizonDeg, tel.sun.eclipseCover)
        : null,
    [tel],
  );

  if (tab === "missions") return <MissionsPanel />;

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
  const note = terrainNote(entry, synthetic);
  const setSub = (id: string) => useSim.getState().setSubTab(tab, id);

  let body: React.ReactNode = null;

  if (tab === "illumination" && sub === "overview") {
    body = <Overview entry={entry} tel={tel} tMs={tMs} yr={yr} />;
  } else if (tab === "illumination" && sub === "sun") {
    const eclipsed = tel.sun.eclipseCover > 0.005;
    body = (
      <>
        <div className="sw-grid2">
          <Stat
            icon={<Sun size={13} />} label="Sun"
            value={eclipsed ? "ECLIPSE" : tel.sun.lit ? "LIT" : "DARK"}
            tag="COMPUTED"
            status={tel.sun.lit && !eclipsed}
            note={
              eclipsed
                ? `Earth hides ${(tel.sun.eclipseCover * 100).toFixed(0)}% of the Sun`
                : `${(tel.sun.discFraction * 100).toFixed(0)}% of the light clears the horizon`
            }
          />
          <Stat
            icon={<TrendingUp size={13} />} label="Elevation"
            value={fmtDeg(tel.sun.elDeg)}
            tag="COMPUTED"
            note={`horizon ${fmtDeg(tel.sun.horizonDeg)} @ az ${tel.sun.azDeg.toFixed(0)}°`}
          />
          <Stat
            icon={<SunDim size={13} />} label="Illumination, 2026"
            value={yr ? (yr.illumination * 100).toFixed(1) : "…"}
            unit={yr ? "%" : undefined}
            tag="COMPUTED"
            note="mean light: limb-darkened, eclipses removed"
          />
          <Stat
            icon={<Sunrise size={13} />} label="Sun above horizon"
            value={yr ? (yr.litFraction * 100).toFixed(1) : "…"}
            unit={yr ? "%" : undefined}
            tag="COMPUTED"
            note="any part of the disc, rise/set refined"
          />
          <Stat
            icon={<Moon size={13} />} label="Longest dark"
            value={yr ? fmtDuration(yr.longestDarkHours) : "…"}
            tag="COMPUTED"
            note="continuous, in 2026"
          />
          <Stat
            icon={<Eclipse size={13} />} label="Earth eclipses, 2026"
            value={yr ? (yr.eclipseHours > 0 ? fmtDuration(yr.eclipseHours) : "none") : "…"}
            tag="COMPUTED"
            note={yr && yr.eclipseWindows.length > 0 ? `${yr.eclipseWindows.length} event${yr.eclipseWindows.length > 1 ? "s" : ""}: size the battery for them` : "Earth never crosses the Sun here"}
          />
        </div>
      </>
    );
  } else if (tab === "illumination" && sub === "power") {
    body = (
      <>
        <div className="sw-grid2">
          <Stat
            icon={<Sun size={13} />} label="Sun-facing"
            value={Math.round(solar.sunFacing)}
            unit="W/m²"
            tag="MODELED"
            note="limb-darkened, Earth eclipse aware"
          />
          <Stat icon={<ArrowDownToLine size={13} />} label="Flat on ground" value={solar.flat.toFixed(0)} unit="W/m²" tag="MODELED" note="× sin(elevation)" />
          <Stat
            icon={<SunDim size={13} />} label="Light reaching site"
            value={(solar.discFraction * 100).toFixed(0)}
            unit="%"
            tag="COMPUTED"
            note="intensity above the horizon"
          />
          <Stat
            icon={<SunDim size={13} />}
            label={`Lit, ${windowDays} d window`}
            value={w ? (w.illumination * 100).toFixed(1) : "…"}
            unit={w ? "%" : undefined}
            tag="COMPUTED"
            note="mean light · Sun swings ±1.5° a year"
          />
        </div>
        <h4 className="sw-sub">Solar array + battery · MODELED</h4>
        <PowerSim />
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
  } else if (tab === "comms" && sub === "contact") {
    body = <ContactPanel entry={entry} tMs={tMs} yr={yr} />;
  } else if (tab === "comms" && sub === "link") {
    body = <LinkSim />;
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
  } else if (tab === "environment") {
    body = <EnvironmentPanel entry={entry} sub={sub} />;
  } else if (tab === "relay" && sub === "status") {
    const link = relayLink(orbit, site, entry.mask, tMs, moonStateAt(tMs).earthKm);
    body = (
      <>
        <div className="sw-grid2">
          <Stat
            icon={<Satellite size={13} />} label="Site sees relay"
            value={link.siteSeesRelay ? "YES" : "NO"}
            tag="MODELED"
            status={link.siteSeesRelay}
            note={`el ${fmtDeg(link.elDeg)} · ${Math.round(link.rangeKm).toLocaleString()} km`}
          />
          <Stat
            icon={<SatelliteDish size={13} />} label="Relay sees Earth"
            value={link.relaySeesEarth ? "YES" : "NO"}
            tag="MODELED"
            status={link.relaySeesEarth}
            note={`altitude ${Math.round(link.altitudeKm).toLocaleString()} km`}
          />
          <Stat
            icon={<Repeat size={13} />} label="Relayed link, 48 h"
            value={relay.status === "done" ? (relay.windows.linkedFraction * 100).toFixed(0) : "…"}
            unit={relay.status === "done" ? "%" : undefined}
            tag="MODELED"
            note="site → relay → Earth"
          />
          <Stat
            icon={<Route size={13} />} label="Any path, 48 h"
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
        <label className="sw-field">
          <span>Gravity model</span>
          <select
            value={gravityModel}
            onChange={(e) => useSim.getState().setGravityModel(e.target.value as GravityModel)}
          >
            <option value="two-body">Two-body Kepler (ideal)</option>
            <option value="moon">Moon gravity (J2 + C22)</option>
            <option value="moon+earth">Moon gravity + Earth &amp; Sun</option>
          </select>
        </label>
        <p className="sw-note">
          {orbit.note}{" "}
          {relay.status === "done" && relay.driftKm !== null
            ? `Integrated numerically (RK4, 30 s) with ${relay.field}: after 48 h the real orbit is ${Math.round(relay.driftKm).toLocaleString()} km from the two-body one, and the pass times above follow the real one. MODELED: osculating start, no radiation pressure.`
            : relay.status === "running"
              ? "Integrating…"
              : "Ideal two-body orbit: no lumpy gravity, no Earth pull."}
        </p>
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

  const eclipsed = tel.sun.eclipseCover > 0.005;
  const sunState = eclipsed ? "Eclipse" : tel.sun.lit ? "Lit" : "Dark";

  return (
    <Glass className="sw-panel sw2-site" aria-label="Site analysis">
      <div className="sw2-site-head">
        <div className="sw2-site-title">
          <span className="sw2-title">Site analysis</span>
          <h3 className="sw-site">{site.name}</h3>
          <div className="sw-coord">
            {fmtLat(site.latDeg)} {fmtLon(site.lonDeg)}
            {site.heightKm !== undefined ? ` · ${site.heightKm >= 0 ? "+" : ""}${site.heightKm.toFixed(2)} km` : ""}
          </div>
        </div>
        <select
          className="sw2-select sw2-site-pick"
          value={site.id}
          onChange={(e) => useSim.getState().focusOn(e.target.value)}
          aria-label="Choose a site"
        >
          {Object.values(allSites).map((e) => (
            <option key={e.site.id} value={e.site.id}>
              {e.site.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sw2-pills">
        <span className={`sw2-pill ${tel.sun.lit && !eclipsed ? "on" : ""}`} title="Is the Sun above this site's terrain skyline right now?">
          <Sun size={12} /> {sunState}
        </span>
        <span className={`sw2-pill ${tel.dsn.linked ? "on" : ""}`} title="Can a Deep Space Network station talk to this site right now?">
          <SatelliteDish size={12} /> {tel.dsn.linked ? "Linked" : "No link"}
        </span>
        <span className={`sw2-pill ${note.warn ? "warn" : ""}`} title={note.text}>
          <Mountain size={12} /> {SOURCE_LABEL[entry.source]}
        </span>
      </div>
      <SubTabs tabs={SUBTABS[tab]} value={sub} onChange={setSub} />
      <div className="sw-panel-body sw2-scroll">
        {note.warn && <p className="sw-note sw-note-warn">{note.text}</p>}
        {body}
      </div>
    </Glass>
  );
}
