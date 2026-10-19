"use client";

import { Activity, Radio, SatelliteDish, Timer } from "lucide-react";
import { useMemo } from "react";
import { moonStateAt } from "@/astro/cache";
import { lightTimeUnits } from "@/astro/comms";
import type { SweepResult } from "@/astro/sweep";
import { dsnStatus } from "@/astro/visibility";
import { fmtDeg, fmtDuration, fmtPct } from "@/lib/format";
import { useMastMask } from "@/lib/useMastMask";
import { useLink } from "@/store/link";
import type { SiteEntry } from "@/store/world";
import { Meter, StatCard } from "./cards";
import { Tag } from "./ui";

/**
 * Earth contact at a glance: is a station listening right now, how long the signal takes, how much of the year the
 * site can talk, and which of the three DSN complexes can hear it. Uses the antenna's mast-height horizon, so the
 * mast slider in the Link tab changes this page too.
 */
export function ContactPanel({ entry, tMs, yr }: { entry: SiteEntry; tMs: number; yr: SweepResult | null }) {
  const mastM = useLink((s) => s.mastM);
  const { mask } = useMastMask(entry, mastM);
  const dsn = useMemo(() => (mask ? dsnStatus(moonStateAt(tMs), entry.site, mask) : null), [mask, entry.site, tMs]);
  if (!dsn) return null;
  const best = dsn.best;
  const km = best ? best.rangeKm : Math.hypot(...moonStateAt(tMs).earthKm);
  const lt = lightTimeUnits(km);

  return (
    <>
      <div className="sw2-cards">
        <StatCard
          icon={<SatelliteDish size={20} />}
          label="Station link"
          tag="COMPUTED"
          info="Needs a Deep Space Network station above this site's skyline (from the mast top) AND the Moon at least 10° up at that station."
          value={best ? "Linked" : "No station"}
          status={dsn.linked}
          note={best ? `${best.name} · Moon ${fmtDeg(best.moonElAtStationDeg, 0)} up there` : "No complex can hear this site right now"}
        />
        <StatCard
          icon={<Activity size={20} />}
          label="Signal time, one way"
          tag="COMPUTED"
          info="Station distance divided by the speed of light."
          value={lt.s.toFixed(3)}
          unit="s"
          sub={`(${lt.ms.toFixed(0)} ms)`}
          note={`${Math.round(km).toLocaleString()} km · round trip ${(lt.s * 2).toFixed(2)} s`}
        />
        <StatCard
          icon={<Radio size={20} />}
          label="Station reach, 2026"
          tag="COMPUTED"
          info="Share of the year at least one station can talk to this site."
          value={yr ? (yr.dsnFraction * 100).toFixed(1) : "…"}
          unit={yr ? "%" : undefined}
          note={yr ? `Earth's centre alone is in view ${fmtPct(yr.earthVisibleFraction)}` : "Computing the year…"}
          viz={yr ? <Meter value={yr.dsnFraction} label="Station reach" /> : null}
        />
        <StatCard
          icon={<Timer size={20} />}
          label="Longest blackout"
          tag="COMPUTED"
          info="The longest unbroken time in 2026 with no station able to reach the site. A lander must hold its data this long."
          value={yr ? fmtDuration(yr.longestDsnBlackoutHours) : "…"}
          note="No station, continuous"
        />
      </div>
      <h4 className="sw-sub">Deep Space Network complexes</h4>
      <table className="sw-table sw2-table">
        <thead>
          <tr>
            <th>Station</th>
            <th>From site</th>
            <th>Moon there</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {dsn.stations.map((s) => (
            <tr key={s.id} className={s.id === best?.id ? "on" : undefined}>
              <td>{s.name.split(",")[0]}</td>
              <td>
                {fmtDeg(s.elDeg, 1)} <small>/ rim {fmtDeg(s.horizonDeg, 1)}</small>
              </td>
              <td>{fmtDeg(s.moonElAtStationDeg, 0)}</td>
              <td>{s.linked ? "LINK" : !s.siteSeesStation ? "hidden by rim" : "Moon set"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sw-note">
        The three complexes sit about 120° apart, so one almost always has the Moon up. A link also needs the station above
        the site&apos;s own skyline. <Tag kind="COMPUTED" />
      </p>
    </>
  );
}
