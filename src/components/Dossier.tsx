"use client";

import { OUTCOME_LABEL, type Mission, type MissionImage, thumbUrl } from "@/lib/data";
import { fmtDate, fmtLat, fmtLon } from "@/lib/format";
import { SUBTABS, useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { Flag, Glass, SubTabs } from "./ui";

const DAY = 86_400_000;
const SLOTS = 4;

type Img = { src: string; caption?: string; credit?: string; license?: string; href?: string };
const norm = (i: MissionImage): Img => (typeof i === "string" ? { src: i } : i);

/** Selected mission, one facet at a time: Brief, Images, Facts. */
export function Dossier() {
  const id = useSim((s) => s.selectedMissionId);
  const sub = useSim((s) => s.subTabs.missions);
  const missions = useWorld((s) => s.missions);
  const m: Mission | undefined = missions.find((x) => x.id === id);
  const { selectSite, setWindow, setTab, setSubTab } = useSim.getState();

  if (!m) {
    return (
      <Glass className="sw-panel">
        <div className="sw-panel-head">
          <span className="sw-label">Mission dossier</span>
        </div>
        <p className="sw-note sw-pad">Pick a mission from the archive.</p>
      </Glass>
    );
  }

  const ms = m.dateUtc ? Date.parse(m.dateUtc) : null;
  const plotted = m.lat !== null && m.lon !== null;
  const images = m.images.map(norm);
  const unverified = [m.verify.coords && "coordinates", m.verify.date && "date", m.verify.status && "status"].filter(Boolean);

  let body: React.ReactNode;
  if (sub === "images") {
    body = (
      <div className="sw-gallery">
        {Array.from({ length: Math.max(images.length, SLOTS) }).map((_, i) => {
          const img = images[i];
          return (
            <figure key={img?.src ?? `slot-${i}`}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.src} alt={img.caption ?? `${m.name} ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <div className="sw-slot">
                  IMAGE SLOT {i + 1}
                  <br />
                  public/missions/{m.id}/
                </div>
              )}
              {img && (img.caption || img.credit) && (
                <figcaption>
                  {img.caption}
                  {img.credit && (
                    <span className="sw-credit">
                      {" "}
                      {img.href ? (
                        <a href={img.href} target="_blank" rel="noreferrer">
                          {img.credit}
                        </a>
                      ) : (
                        img.credit
                      )}
                      {img.license ? ` · ${img.license}` : ""}
                    </span>
                  )}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
    );
  } else if (sub === "facts") {
    body = (
      <>
        {m.achievements.length > 0 ? (
          <ul className="sw-facts">
            {m.achievements.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="sw-note">No achievements recorded.</p>
        )}
        {unverified.length > 0 && (
          <p className="sw-note sw-note-warn">UNVERIFIED: {unverified.join(", ")} still need a primary source.</p>
        )}
        <div>
          {m.sources.map((s) => (
            <a key={s} href={s} target="_blank" rel="noreferrer" className="sw-link">
              Source ↗
            </a>
          ))}
          {m.sources.length === 0 && <p className="sw-note">No source recorded yet.</p>}
        </div>
      </>
    );
  } else {
    const hero = images[0];
    body = (
      <>
        {hero && (
          <figure className="sw-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(hero.src, 500)} alt={hero.caption ?? m.name} referrerPolicy="no-referrer" />
            <figcaption>
              {hero.caption}
              {hero.credit && (
                <span className="sw-credit">
                  {" "}
                  <a href={hero.href} target="_blank" rel="noreferrer">
                    {hero.credit}
                  </a>
                  {hero.license ? ` · ${hero.license}` : ""}
                </span>
              )}
            </figcaption>
          </figure>
        )}
        <p className="sw-brief">{m.outcomeText}</p>
        <div className="sw-grid2">
          <div className="sw-stat">
            <div className="sw-stat-label">Date (UTC)</div>
            <div className="sw-stat-value sm">{ms ? fmtDate(ms) : "TBD"}</div>
          </div>
          <div className="sw-stat">
            <div className="sw-stat-label">Site</div>
            <div className="sw-stat-value sm">{plotted ? `${fmtLat(m.lat as number)}` : "—"}</div>
            <div className="sw-stat-note">{plotted ? fmtLon(m.lon as number) : "no verified site"}</div>
          </div>
        </div>
        {ms !== null && (
          <button
            type="button"
            className="sw-btn"
            onClick={() => {
              setWindow(ms - 20 * DAY, ms + 30 * DAY, ms);
              setTab("illumination");
              if (plotted) selectSite(m.id);
            }}
          >
            Replay at site &amp; date
          </button>
        )}
      </>
    );
  }

  return (
    <Glass className="sw-panel">
      <div className="sw-panel-head">
        <div>
          <span className="sw-label sw-agency">
            <Flag code={m.country} /> {m.agency}
          </span>
          <h3 className="sw-site">{m.name}</h3>
        </div>
        <span className={`sw-outcome-pill sw-outcome-${m.outcome}`}>{OUTCOME_LABEL[m.outcome]}</span>
      </div>
      <SubTabs tabs={SUBTABS.missions} value={sub} onChange={(s) => setSubTab("missions", s)} />
      <div className="sw-panel-body">{body}</div>
    </Glass>
  );
}
