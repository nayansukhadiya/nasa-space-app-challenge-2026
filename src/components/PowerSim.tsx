"use client";

import { BatteryCharging, Gauge, Radio, Zap } from "lucide-react";
import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { panelPowerW, simulatePower, type PanelMode } from "@/astro/power";
import { useSelectedEntry, useTelemetry, useThrottledT } from "@/lib/hooks";
import { useLink } from "@/store/link";
import { useSim } from "@/store/sim";
import { Glass, Stat, Tag } from "./ui";
import { Slider } from "./ui/slider";

/**
 * Solar-as-power dashboard (MODELED): array mount + sizing on the left,
 * live watts + 48 h battery simulation on the right. All Sun geometry is
 * COMPUTED from real ephemeris + LOLA horizons; watts are an upper bound
 * (uniform disc, no dust/temperature derating).
 */
export function PowerSim() {
  const entry = useSelectedEntry();
  const tMs = useThrottledT(500);
  const tel = useTelemetry(entry, tMs);
  const windowStartMs = useSim((s) => s.windowStartMs);
  const windowEndMs = useSim((s) => s.windowEndMs);
  const power = useLink((s) => s.power);
  const setPower = useLink((s) => s.setPower);

  const liveW = useMemo(
    () => (tel ? panelPowerW(power, tel.sun) : null),
    [tel, power],
  );

  const sim = useMemo(() => {
    if (!entry) return null;
    // 6 h steps keep the 90 d scrubber window under ~400 points.
    const step = 6 * 3_600_000;
    return simulatePower(entry.site, entry.mask, power, windowStartMs, windowEndMs, step);
  }, [entry, power, windowStartMs, windowEndMs]);

  const chart = useMemo(() => {
    if (!sim) return [];
    const pts: Array<{ t: number; solar: number; soc: number }> = [];
    const stride = Math.max(1, Math.floor(sim.tMs.length / 120));
    for (let i = 0; i < sim.tMs.length; i += stride) {
      pts.push({
        t: sim.tMs[i],
        solar: Math.round(sim.solarW[i] * 10) / 10,
        soc: Math.round(sim.socWh[i] * 10) / 10,
      });
    }
    return pts;
  }, [sim]);

  if (!entry || !tel || liveW === null || !sim) {
    return (
      <Glass className="sw-active" as="section" aria-label="Power simulation">
        <span className="sw-label">Solar power · MODELED</span>
        <p className="sw-note">Pick a site to size its array.</p>
      </Glass>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="sw-grid2">
        <Stat
          icon={<Zap size={13} />} label="Array now"
          value={liveW.toFixed(1)}
          unit="W"
          tag="MODELED"
          note={`${power.mode} · ${power.panelAreaM2.toFixed(1)} m² · ${(power.efficiency * 100).toFixed(0)}%`}
        />
        <Stat
          icon={<BatteryCharging size={13} />} label="Battery"
          value={sim.socWh[sim.socWh.length - 1]?.toFixed(0) ?? "…"}
          unit="Wh"
          tag="MODELED"
          note={`min ${sim.minSocWh.toFixed(0)} Wh · alive ${(sim.aliveFraction * 100).toFixed(0)}%`}
        />
        <Stat
          icon={<Gauge size={13} />} label="Generated"
          value={sim.generatedWh >= 1000 ? (sim.generatedWh / 1000).toFixed(1) : sim.generatedWh.toFixed(0)}
          unit={sim.generatedWh >= 1000 ? "kWh" : "Wh"}
          tag="MODELED"
          note="over scrubber window"
        />
        <Stat
          icon={<Radio size={13} />} label="Can transmit"
          value={(sim.txFraction * 100).toFixed(0)}
          unit="%"
          tag="MODELED"
          note="Earth up + powered"
        />
      </div>

      <div style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
            <XAxis dataKey="t" tick={false} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: "#6f827f" }} axisLine={false} tickLine={false} width={40} />
            <Line type="monotone" dataKey="solar" stroke="#2fdccf" strokeWidth={1.5} dot={false} name="Solar W" />
            <Line type="monotone" dataKey="soc" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1} dot={false} name="SoC Wh" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <label className="sw-field">
        <span>
          Array mount · <Tag kind="MODELED" />
        </span>
        <select
          value={power.mode}
          onChange={(e) => setPower({ mode: e.target.value as PanelMode })}
        >
          <option value="flat">Flat on ground</option>
          <option value="vertical">Vertical (choose azimuth)</option>
          <option value="tracking">Sun-tracking</option>
        </select>
      </label>

      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Area</span>
          <b>{power.panelAreaM2.toFixed(1)} m²</b>
        </div>
        <Slider
          min={0.1}
          max={10}
          step={0.1}
          value={[power.panelAreaM2]}
          aria-label="Panel area"
          onValueChange={([v]) => setPower({ panelAreaM2: v })}
        />
      </div>
      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Efficiency</span>
          <b>{(power.efficiency * 100).toFixed(0)}%</b>
        </div>
        <Slider
          min={0.1}
          max={0.4}
          step={0.01}
          value={[power.efficiency]}
          aria-label="Cell efficiency"
          onValueChange={([v]) => setPower({ efficiency: v })}
        />
      </div>
      <div className="sw-relief-row">
        <div className="sw-relief-head">
          <span>Battery</span>
          <b>{power.batteryWh.toFixed(0)} Wh</b>
        </div>
        <Slider
          min={50}
          max={1000}
          step={10}
          value={[power.batteryWh]}
          aria-label="Battery capacity"
          onValueChange={([v]) => setPower({ batteryWh: v })}
        />
      </div>
      <p className="sw-note">
        Upper bound, not a mission figure. Sun geometry is COMPUTED; watts assume a clean cool array.
      </p>
    </div>
  );
}
