"use client";

import { ArrowUp, Clock, Eye, Hourglass, Mountain, MoveVertical, Radiation, Rocket, Ruler, SatelliteDish, Scale, ShieldOff, SunDim, Trophy, Weight } from "lucide-react";
import { useState } from "react";
import { GM_MOON, circularPeriodS, freeFallS, hangTimeS, horizonDistanceKm, surfaceGravity } from "@/astro/gravity";
import { skyViewFactor } from "@/astro/horizon";
import { lunarClockGainUsPerDay } from "@/astro/relativity";
import { fmtDuration, fmtPct } from "@/lib/format";
import { useGravityField } from "@/lib/useGravity";
import { useLink } from "@/store/link";
import { useSim } from "@/store/sim";
import type { RegionStats } from "@/workers/terrain.worker";
import { terrainWorker } from "@/workers/client";
import type { SiteEntry } from "@/store/world";
import { Stat, Tag } from "./ui";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";

/** Chang'e-4 LND surface dose rate, mSv/day (Zhang et al. 2020): galactic cosmic rays near solar minimum, no storms. */
const CE4_DOSE_MSV_DAY = 1.369;

/** NASA Moon Fact Sheet constants and Diviner extremes, each tagged MEASURED. */
const FACTS: Array<[string, string]> = [
  ["Surface gravity", "1.62 m/s² (0.165 g)"],
  ["Escape velocity", "2.38 km/s"],
  ["Atmosphere", "None: a thin exosphere, ~25,000 kg in total"],
  ["Night surface pressure", "3 × 10⁻¹⁵ bar"],
  ["Equator temperature", "95 K to 390 K (−178 °C to +117 °C)"],
  ["Permanently shadowed craters", "~35 K (−238 °C), Diviner"],
  ["Solar irradiance", "1361 W/m²"],
  ["Bond albedo", "0.11"],
  ["Synodic day", "29.53 Earth days"],
  ["Spin-axis tilt to the ecliptic", "1.54°"],
  ["Earth distance", "357,000 – 407,000 km (light time 1.19 – 1.36 s)"],
  ["Surface radiation", "1,369 µSv/day (Chang'e-4), ~2.6 × the ISS crew dose"],
];

function Gravity({ entry }: { entry: SiteEntry }) {
  const field = useGravityField();
  const mast = useLink((s) => s.mastM);
  const g = surfaceGravity(field, entry.site.latDeg, entry.site.lonDeg, entry.site.heightKm ?? 0);
  const g0 = surfaceGravity(field, entry.site.latDeg, entry.site.lonDeg, 0);
  const weightN = g.gMs2; // 1 kg
  const fallS = freeFallS(1, g.gMs2);
  const hang = hangTimeS(3, g.gMs2);
  const h = entry.site.heightKm ?? 0;

  return (
    <>
      <div className="sw-grid2">
        <Stat
          icon={<Weight size={13} />} label="Gravity here"
          value={g.gMs2.toFixed(4)}
          unit="m/s²"
          tag="COMPUTED"
          note={`${(g.gMs2 / 9.80665).toFixed(4)} g · r = ${g.radiusKm.toFixed(2)} km`}
        />
        <Stat
          icon={<Mountain size={13} />} label="vs sea-level sphere"
          value={`${((g.gMs2 / g0.gMs2 - 1) * 100).toFixed(3)}`}
          unit="%"
          tag="COMPUTED"
          note={`${h >= 0 ? "+" : ""}${h.toFixed(2)} km elevation: lower ground weighs more`}
        />
        <Stat icon={<Scale size={13} />} label="1 kg weighs" value={weightN.toFixed(3)} unit="N" tag="COMPUTED" note="on Earth: 9.807 N" />
        <Stat
          icon={<Rocket size={13} />} label="Escape speed"
          value={g.escapeKmS.toFixed(3)}
          unit="km/s"
          tag="COMPUTED"
          note={`circular orbit ${g.circularKmS.toFixed(3)} km/s`}
        />
        <Stat icon={<MoveVertical size={13} />} label="1 m drop" value={fallS.toFixed(2)} unit="s" tag="COMPUTED" note="t = √(2h/g)" />
        <Stat icon={<ArrowUp size={13} />} label="3 m/s jump" value={hang.toFixed(1)} unit="s" tag="COMPUTED" note="hang time 2v/g" />
        <Stat
          icon={<Ruler size={13} />}
          label={`${mast.toFixed(0)} m mast sees`}
          value={horizonDistanceKm(mast / 1000).toFixed(1)}
          unit="km"
          tag="COMPUTED"
          note="to a flat horizon, √(2Rh)"
        />
        <Stat
          icon={<Clock size={13} />} label="Lunar clock"
          value={`+${lunarClockGainUsPerDay().toFixed(1)}`}
          unit="µs/day"
          tag="COMPUTED"
          note="fast vs Earth (GR): shifts signals"
        />
      </div>
      <p className="sw-note">
        Field: <b>{field.name}</b> (GM = {GM_MOON.toFixed(1)} km³/s², {field.source}). Low orbit period at 100 km:{" "}
        {fmtDuration(circularPeriodS(1737.4 + 100) / 3600)}. Centrifugal part of g: {g.centrifugalMs2 < 1e-9 ? "0 (on the spin axis)" : `${g.centrifugalMs2.toExponential(1)} m/s²`}.
        Mascons live in higher harmonics than this field carries, so local g here is good to a few parts in 10³ and
        not to the milligal.
      </p>
    </>
  );
}

function Shield({ entry }: { entry: SiteEntry }) {
  const [days, setDays] = useState(14);
  const v = skyViewFactor(entry.mask);
  const perDay = CE4_DOSE_MSV_DAY * v;
  return (
    <>
      <div className="sw-grid2">
        <Stat icon={<Eye size={13} />} label="Sky open" value={fmtPct(v)} tag="COMPUTED" note="solid angle above the skyline" />
        <Stat
          icon={<Radiation size={13} />} label="Dose rate here"
          value={perDay.toFixed(3)}
          unit="mSv/d"
          tag="MODELED"
          note={`open sky ${CE4_DOSE_MSV_DAY} mSv/d × sky fraction`}
        />
        <Stat icon={<Hourglass size={13} />}
          label={`${days}-day stay`} value={(perDay * days).toFixed(1)} unit="mSv" tag="MODELED" />
        <Stat icon={<ShieldOff size={13} />} label="Unshielded" value={(CE4_DOSE_MSV_DAY * days).toFixed(1)} unit="mSv" tag="MEASURED" note="Chang'e-4 rate" />
      </div>
      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Mission length</span>
          <b>{days} d</b>
        </div>
        <Slider min={1} max={365} step={1} value={[days]} aria-label="Mission days" onValueChange={([x]) => setDays(x)} />
      </div>
      <p className="sw-note">
        Crater walls block part of the cosmic-ray sky; dose scales with the open fraction V = (1/2π)∮(1 − sin θ<sub>h</sub>)dA.
        The rate was measured near solar minimum; 2026 is near solar maximum, when galactic rays are weaker but solar
        storms can add far more in hours. Soil secondaries are not included.
      </p>
    </>
  );
}

function Region({ entry }: { entry: SiteEntry }) {
  const winStart = useSim((s) => s.windowStartMs);
  const winEnd = useSim((s) => s.windowEndMs);
  const [radius, setRadius] = useState(2);
  const [spacing, setSpacing] = useState(0.5);
  const [state, setState] = useState<{ status: "idle" | "running" | "done" | "error"; res?: RegionStats | null }>({ status: "idle" });
  const run = async () => {
    setState({ status: "running" });
    try {
      const res = await terrainWorker().region(entry.site.latDeg, entry.site.lonDeg, radius, spacing, winStart, winEnd);
      setState({ status: "done", res });
    } catch {
      setState({ status: "error" });
    }
  };
  const r = state.res;
  const pts = Math.round((Math.PI * radius * radius) / (spacing * spacing));
  return (
    <>
      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Region radius</span>
          <b>{radius.toFixed(1)} km</b>
        </div>
        <Slider min={0.5} max={5} step={0.5} value={[radius]} aria-label="Region radius" onValueChange={([x]) => setRadius(x)} />
      </div>
      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Grid spacing</span>
          <b>{(spacing * 1000).toFixed(0)} m</b>
        </div>
        <Slider min={0.25} max={1} step={0.25} value={[spacing]} aria-label="Grid spacing" onValueChange={([x]) => setSpacing(x)} />
      </div>
      <Button variant="accent" size="sm" onClick={run} disabled={state.status === "running" || !entry.masked}>
        {state.status === "running" ? `Computing ~${pts} horizons…` : `Evaluate ~${pts} points`}
      </Button>
      {r && (
        <div className="sw-grid2" style={{ marginTop: 8 }}>
          <Stat
            icon={<SunDim size={13} />} label="Illumination, median"
            value={fmtPct(r.illumination.p50)}
            tag="COMPUTED"
            note={`P10 ${fmtPct(r.illumination.p10)} · P90 ${fmtPct(r.illumination.p90)}`}
          />
          <Stat
            icon={<Trophy size={13} />} label="Best / worst point"
            value={`${fmtPct(r.illumination.max)}`}
            tag="COMPUTED"
            note={`worst ${fmtPct(r.illumination.min)} · ${r.points} points`}
          />
          <Stat
            icon={<SatelliteDish size={13} />} label="DSN reach, median"
            value={fmtPct(r.dsnFraction.p50)}
            tag="COMPUTED"
            note={`P10 ${fmtPct(r.dsnFraction.p10)} · P90 ${fmtPct(r.dsnFraction.p90)}`}
          />
        </div>
      )}
      {state.status === "done" && !r && <p className="sw-note sw-note-warn">This site is off the loaded maps, so no region can be evaluated.</p>}
      {state.status === "error" && <p className="sw-note sw-note-warn">The calculation failed. Try a smaller region.</p>}
      <p className="sw-note">
        Nobody lands on a point. Each grid point gets its own 0.25° horizon and is swept over the scrubber window, so the
        spread shows how much a few hundred metres matter. <Tag kind="COMPUTED" /> from 391 m LOLA terrain: sub-pixel
        relief is not resolved.
      </p>
    </>
  );
}

/** The Environment tab body: gravity, shielding, landing-region spread and fixed constants, one at a time. */
export function EnvironmentPanel({ entry, sub }: { entry: SiteEntry; sub: string }) {
  if (sub === "shield") return <Shield entry={entry} />;
  if (sub === "region") return <Region entry={entry} />;
  if (sub === "facts") {
    return (
      <>
        <table className="sw-table">
          <tbody>
            {FACTS.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sw-note">
          <Tag kind="MEASURED" /> NASA NSSDCA Moon Fact Sheet; temperature extremes from LRO Diviner (Paige et al. 2010).
        </p>
      </>
    );
  }
  return <Gravity entry={entry} />;
}
