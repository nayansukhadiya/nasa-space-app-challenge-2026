"use client";

import { useMemo } from "react";
import { panelPowerW } from "@/astro/power";
import { SOLAR_CONSTANT_W_M2 } from "@/astro/solar";
import { fmtLat, fmtLon } from "@/lib/format";
import { useSelectedEntry, useTelemetry, useThrottledT } from "@/lib/hooks";
import { computeLink } from "@/lib/linkCalc";
import { useMastMask } from "@/lib/useMastMask";
import { useLink } from "@/store/link";
import { Glass } from "./ui";
import { Badge } from "./ui/badge";

/** Link margin that fills the meter, dB. A margin of 0 is the lock threshold; 20 dB is a comfortable link. */
const FULL_MARGIN_DB = 20;

/**
 * Compact active-asset header: site name, LIT/DARK, and two meters that are real quantities, not decoration:
 *   Power = array output now ÷ what the same array would give in full, Sun-facing sunlight at this distance;
 *   Link  = the worse of the up/down margins, 0 dB (lock threshold) to 20 dB.
 */
export function ActiveAsset() {
  const entry = useSelectedEntry();
  const tMs = useThrottledT(500);
  const tel = useTelemetry(entry, tMs);
  const link = useLink();
  const { mask } = useMastMask(entry, link.mastM);

  const power = useMemo(() => {
    if (!tel) return null;
    const w = panelPowerW(link.power, tel.sun);
    const ideal = SOLAR_CONSTANT_W_M2 * link.power.panelAreaM2 * link.power.efficiency;
    return { w, frac: Math.max(0, Math.min(1, w / ideal)) };
  }, [tel, link.power]);

  const live = useMemo(
    () => (entry && mask ? computeLink(entry.site, mask, link, tMs, null) : null),
    [entry, mask, link, tMs],
  );

  if (!entry) return null;
  const margin = live ? Math.min(live.down.marginDb, live.up.marginDb) : null;
  const linkFrac = live && live.available && margin !== null ? Math.max(0, Math.min(1, margin / FULL_MARGIN_DB)) : 0;
  const eclipsed = !!tel && tel.sun.eclipseCover > 0.005;

  return (
    <Glass className="sw-active" as="section" aria-label="Active asset">
      <div className="sw-active-top">
        <span className="sw-label">Active asset</span>
        <Badge variant={tel?.sun.lit && !eclipsed ? "accent" : "default"}>
          {tel ? (eclipsed ? "ECLIPSE · COMPUTED" : tel.sun.lit ? "LIT · COMPUTED" : "DARK · COMPUTED") : "…"}
        </Badge>
      </div>
      <div className="sw-active-name" title={entry.site.name}>
        {entry.site.name}
      </div>
      <div className="sw-coord">
        {fmtLat(entry.site.latDeg)} · {fmtLon(entry.site.lonDeg)}
        {live ? ` · ${live.station ? live.station.name.split(",")[0] : "no station"}` : ""}
      </div>
      <div className="sw-meters">
        <div className="sw-meter">
          <div className="sw-meter-head">
            <span>Power</span>
            <span>{power ? `${power.w.toFixed(1)} W` : "…"}</span>
          </div>
          <div className="sw-meter-track">
            <div className="sw-meter-fill" style={{ width: `${(power?.frac ?? 0) * 100}%` }} />
          </div>
        </div>
        <div className="sw-meter">
          <div className="sw-meter-head">
            <span>Link</span>
            <span>{live && live.available && margin !== null ? `${margin.toFixed(1)} dB` : "blocked"}</span>
          </div>
          <div className="sw-meter-track">
            <div className="sw-meter-fill" style={{ width: `${linkFrac * 100}%` }} />
          </div>
        </div>
      </div>
    </Glass>
  );
}
