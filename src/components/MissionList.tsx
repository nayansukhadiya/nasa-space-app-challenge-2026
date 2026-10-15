"use client";

import { useState } from "react";
import { OUTCOME_LABEL, type Mission, type Outcome, thumbUrl } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { Flag, Glass } from "./ui";

const FILTERS: Array<Outcome | "all"> = ["all", "success", "partial", "failure", "planned"];

function cardImage(m: Mission): string | null {
  const i = m.images[0];
  return i ? (typeof i === "string" ? i : i.src) : null;
}

/** Card photo: the actual spacecraft or rover first; falls back to the full-size file if a thumbnail size is missing. */
function CardPhoto({ src }: { src: string | null }) {
  if (!src) return <span className="sw-card-img sw-card-none">No photo yet</span>;
  return (
    <span className="sw-card-img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbUrl(src, 330)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(e) => {
          if (e.currentTarget.src !== src) e.currentTarget.src = src;
        }}
      />
    </span>
  );
}

function MissionCard({ m }: { m: Mission }) {
  const selected = useSim((s) => s.selectedMissionId === m.id);
  const { selectSite, selectMission, setTab } = useSim.getState();
  const plotted = m.lat !== null && m.lon !== null;
  const ms = m.dateUtc ? Date.parse(m.dateUtc) : null;

  return (
    <li>
      <button
        type="button"
        className={`sw-card ${selected ? "sw-card-on" : ""}`}
        onClick={() => {
          selectMission(m.id);
          if (plotted) selectSite(m.id);
          setTab("missions");
        }}
      >
        <CardPhoto src={cardImage(m)} />
        <span className="sw-card-body">
          <span className="sw-row-name">{m.name}</span>
          <span className="sw-row-meta">
            <Flag code={m.country} /> {m.agency}
          </span>
          <span className="sw-row-meta">{ms ? fmtDate(ms) : "date TBD"}</span>
        </span>
        <span className={`sw-outcome sw-outcome-${m.outcome}`}>{OUTCOME_LABEL[m.outcome]}</span>
      </button>
    </li>
  );
}

/** Compact archive of cards with real photos; collapses to just its header. */
export function MissionList() {
  const missions = useWorld((s) => s.missions);
  const open = useSim((s) => s.leftOpen);
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const rows = missions.filter((m) => filter === "all" || m.outcome === filter);

  return (
    <Glass className="sw-archive" as="aside">
      <button type="button" className="sw-archive-head" onClick={() => useSim.getState().setLeftOpen(!open)} aria-expanded={open}>
        <span className="sw-label">Mission archive · {missions.length}</span>
        <span className="sw-caret">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <>
          <div className="sw-chips" role="group" aria-label="Filter by outcome">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className={`sw-chip ${filter === f ? "sw-chip-on" : ""}`}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
              >
                {f === "all" ? "All" : OUTCOME_LABEL[f]}
              </button>
            ))}
          </div>
          <ul className="sw-rows">
            {rows.map((m) => (
              <MissionCard key={m.id} m={m} />
            ))}
            {rows.length === 0 && <li className="sw-note sw-pad">No missions match.</li>}
          </ul>
        </>
      )}
    </Glass>
  );
}
