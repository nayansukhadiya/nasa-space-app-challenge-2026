"use client";

import { Activity, Moon, SatelliteDish, Sun, Zap } from "lucide-react";
import { useMemo } from "react";
import { lightTimeUnits } from "@/astro/comms";
import { panelPowerW } from "@/astro/power";
import { SOLAR_CONSTANT_W_M2 } from "@/astro/solar";
import type { SweepResult } from "@/astro/sweep";
import { computeTimeline } from "@/astro/timeline";
import type { SiteTelemetry } from "@/astro/visibility";
import { fmtDeg, fmtDuration, fmtPct } from "@/lib/format";
import { useLink } from "@/store/link";
import type { SiteEntry } from "@/store/world";
import { Meter, Spark, StatCard } from "./cards";

const HOUR = 3_600_000;

/**
 * The whole picture at a glance: Sun, light over the year, the longest night, Earth contact, signal delay and
 * power, each as one card. Everything here is the same COMPUTED number the detail tabs show, never a separate model.
 */
export function Overview({
  entry,
  tel,
  tMs,
  yr,
}: {
  entry: SiteEntry;
  tel: SiteTelemetry;
  tMs: number;
  yr: SweepResult | null;
}) {
  const power = useLink((s) => s.power);
  const bucket = Math.floor(tMs / (30 * 60_000));
  // 24 h around now, 30-minute samples, for the Sun-elevation sparkline
  const day = useMemo(
    () => computeTimeline(entry.site, entry.mask, entry.mask, bucket * 30 * 60_000 - 12 * HOUR, 24 * HOUR, 30 * 60_000),
    [entry.site, entry.mask, bucket],
  );
  const lt = lightTimeUnits(tel.dsn.best ? tel.dsn.best.rangeKm : tel.earth.rangeKm);
  const eclipsed = tel.sun.eclipseCover > 0.005;
  const w = panelPowerW(power, tel.sun);
  const ideal = SOLAR_CONSTANT_W_M2 * power.panelAreaM2 * power.efficiency;
  const linked = tel.dsn.linked;

  return (
    <div className="sw2-cards">
      <StatCard
        icon={<Sun size={20} />}
        label="Sun elevation"
        tag="COMPUTED"
        info="Height of the Sun's centre above the flat local horizon. The site is lit while the top edge of the Sun clears the terrain skyline in that direction (the dashed line)."
        value={fmtDeg(tel.sun.elDeg)}
        status={tel.sun.lit && !eclipsed}
        note={
          eclipsed
            ? `Eclipse: Earth hides ${(tel.sun.eclipseCover * 100).toFixed(0)}% of the Sun`
            : `${tel.sun.lit ? "Above" : "Below"} the skyline (${fmtDeg(tel.sun.horizonDeg)}) · ${(tel.sun.discFraction * 100).toFixed(0)}% of the light`
        }
        viz={<Spark values={day.sunEl} dashed={day.horizon} markAt={0.5} />}
      />
      <StatCard
        icon={<Sun size={20} strokeWidth={1.4} />}
        label="Illumination, 2026"
        tag="COMPUTED"
        info="Average sunlight over the whole year, counting partial Sun as partial light and removing time spent in Earth's shadow."
        value={yr ? (yr.illumination * 100).toFixed(1) : "…"}
        unit={yr ? "%" : undefined}
        note={yr ? `Sun above the skyline ${fmtPct(yr.litFraction)} of the time` : "Computing the year…"}
        viz={yr ? <Meter value={yr.illumination} label="Illumination" /> : null}
      />
      <StatCard
        icon={<Moon size={20} />}
        label="Longest darkness"
        tag="COMPUTED"
        info="The longest unbroken stretch with the Sun below the terrain skyline in 2026. This is what a battery has to survive."
        value={yr ? fmtDuration(yr.longestDarkHours) : "…"}
        note={yr ? (yr.eclipseHours > 0 ? `Plus ${fmtDuration(yr.eclipseHours)} of Earth eclipse in the year` : "Continuous, in 2026") : undefined}
      />
      <StatCard
        icon={<SatelliteDish size={20} />}
        label="Earth contact"
        tag="COMPUTED"
        info="A link needs a Deep Space Network station above this site's skyline AND the Moon at least 10° up at that station. Earth's disc is about 1° wide from here, so stations differ near the horizon."
        value={linked ? "Linked" : tel.earth.visible ? "No station" : "Blocked"}
        status={linked}
        note={
          linked && tel.dsn.best
            ? `${tel.dsn.best.name.split(",")[0]} · ${yr ? `${fmtPct(yr.dsnFraction)} of 2026` : "…"}`
            : yr
              ? `${fmtPct(yr.dsnFraction)} of 2026 · longest blackout ${fmtDuration(yr.longestDsnBlackoutHours)}`
              : "Computing the year…"
        }
        viz={yr ? <Meter value={yr.dsnFraction} label="Station reach" /> : null}
      />
      <StatCard
        icon={<Activity size={20} />}
        label="Signal time, one way"
        tag="COMPUTED"
        info="Distance to the station divided by the speed of light. It changes by about 10% over a month as the Moon's orbit swings between near and far."
        value={lt.s.toFixed(2)}
        unit="s"
        sub={`(${lt.ms.toFixed(0)} ms)`}
        note={`${Math.round(tel.dsn.best ? tel.dsn.best.rangeKm : tel.earth.rangeKm).toLocaleString()} km · round trip ${(lt.s * 2).toFixed(2)} s`}
      />
      <StatCard
        icon={<Zap size={20} />}
        label="Solar power now"
        tag="MODELED"
        info="Watts from your array (set it in Sun › Power): sunlight at this distance × the light that clears the terrain × the panel angle × cell efficiency. An upper bound: no dust, no heat loss."
        value={w.toFixed(1)}
        unit="W"
        note={`${power.mode} array · ${power.panelAreaM2.toFixed(1)} m² · ${(power.efficiency * 100).toFixed(0)}% cells`}
        viz={<Meter value={w / ideal} label="Share of ideal power" />}
      />
    </div>
  );
}
