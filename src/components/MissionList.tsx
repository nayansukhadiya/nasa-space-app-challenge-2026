"use client";

import { Search } from "lucide-react";
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
  const plotted = m.lat !== null && m.lon !== null;
  const ms = m.dateUtc ? Date.parse(m.dateUtc) : null;

  return (
    <li>
      <button
        type="button"
        className={`sw-card ${selected ? "sw-card-on" : ""}`}
        onClick={() => {
          const s = useSim.getState();
          s.selectMission(m.id);
          if (plotted) s.focusOn(m.id, m.id);
          else s.selectSite(null);
          s.setTab("missions");
        }}
      >
        <CardPhoto src={cardImage(m)} />
        <span className="sw-card-body">
          <span className="sw-row-name">{m.name}</span>
          <span className="sw-row-meta">
            <Flag code={m.country} /> {m.agency}
          </span>
          <span className="sw-row-meta">
            {ms ? fmtDate(ms) : "date TBD"} · {plotted ? "plotted" : "listed"}
          </span>
        </span>
        <span className={`sw-outcome sw-outcome-${m.outcome}`}>{OUTCOME_LABEL[m.outcome]}</span>
      </button>
    </li>
  );
}

/** The mission archive: search, outcome filter and photo cards. Lives in the Missions tab, not on every screen. */
export function MissionArchive() {
  const missions = useWorld((s) => s.missions);
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = missions.filter(
    (m) =>
      (filter === "all" || m.outcome === filter) &&
      (q === "" || m.name.toLowerCase().includes(q) || m.agency.toLowerCase().includes(q)),
  );

  return (
    <Glass className="sw-panel sw2-archive" as="aside">
      <div className="sw-panel-head">
        <div>
          <span className="sw-label">Mission archive</span>
          <h3 className="sw-site">{missions.length} lunar missions</h3>
          <div className="sw-coord">Past and planned. Pick one to fly there, replay its date and read its brief.</div>
        </div>
      </div>
      <label className="sw-search">
        <Search size={13} aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search missions or agencies" aria-label="Search missions" />
      </label>
      <div className="sw-chips" role="group" aria-label="Filter by outcome">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`sw-chip ${filter === f ? "sw-chip-on" : ""}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
            {f === "all" ? "All" : OUTCOME_LABEL[f]}
          </button>
        ))}
      </div>
      <ul className="sw-rows sw2-scroll">
        {rows.map((m) => (
          <MissionCard key={m.id} m={m} />
        ))}
        {rows.length === 0 && <li className="sw-note sw-pad">No missions match.</li>}
      </ul>
    </Glass>
  );
}
