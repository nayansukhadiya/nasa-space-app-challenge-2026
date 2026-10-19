"use client";

import { ArrowLeft } from "lucide-react";
import { useSim } from "@/store/sim";
import { Dossier } from "./Dossier";
import { MissionArchive } from "./MissionList";

/**
 * The Missions tab: the archive of past and planned missions, or one mission's dossier with a way back. Missions are
 * a way to jump to a place and date, not the main screen, so they only take the panel while this tab is open.
 */
export function MissionsPanel() {
  const id = useSim((s) => s.selectedMissionId);
  if (!id) return <MissionArchive />;
  return (
    <div className="sw2-stack">
      <button
        type="button"
        className="sw2-back"
        onClick={() => {
          const s = useSim.getState();
          s.selectMission(null);
          s.clearFocus();
        }}
      >
        <ArrowLeft size={14} /> All missions
      </button>
      <Dossier />
    </div>
  );
}
