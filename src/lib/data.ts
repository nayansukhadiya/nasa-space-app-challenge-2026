import type { Site } from "@/astro/site";

export type Outcome = "success" | "partial" | "failure" | "planned";

/**
 * A local file under public/ ("/missions/x/1.jpg") or a hotlinked one. Hotlinked images must carry
 * `credit` and `license` and a `href` back to the source page; the UI shows them.
 */
export type MissionImage = string | { src: string; caption?: string; credit?: string; license?: string; href?: string };

export interface Mission {
  id: string;
  name: string;
  agency: string;
  /** ISO 3166-1 alpha-2 (lower case) of the agency's country, for the flag. */
  country: string;
  /** Optional official logo file under public/ (e.g. "/agencies/isro.svg"); text is used when absent. */
  agencyLogo?: string;
  dateUtc: string | null;
  lat: number | null;
  lon: number | null;
  /** Fields that are best-known approximations awaiting a primary source. */
  verify: { coords?: boolean; date?: boolean; status?: boolean };
  outcome: Outcome;
  outcomeText: string;
  achievements: string[];
  /** Files under public/, e.g. "/missions/chandrayaan-3/landing.jpg". Strings or {src, caption}. */
  images: MissionImage[];
  sources: string[];
}

export interface Orbiter {
  name: string;
  agency: string;
  country: string;
  image: Exclude<MissionImage, string>;
}

/** A Commons thumbnail URL at another width (falls back to the original if the pattern is not matched). */
export function thumbUrl(src: string, width: number): string {
  return src.replace(/\/(\d+)px-/, `/${width}px-`);
}

export const SOUTH_POLE: Site = { id: "south-pole", name: "Geographic south pole", latDeg: -90, lonDeg: 0 };

export async function loadMissions(baseUrl = "/data"): Promise<Mission[]> {
  const res = await fetch(`${baseUrl}/missions.json`);
  if (!res.ok) throw new Error("missions.json not found");
  return ((await res.json()) as { missions: Mission[] }).missions;
}

export async function loadOrbiters(baseUrl = "/data"): Promise<Orbiter[]> {
  const res = await fetch(`${baseUrl}/missions.json`);
  if (!res.ok) return [];
  return ((await res.json()) as { orbiters?: Orbiter[] }).orbiters ?? [];
}

/** Preset sites: the pole, plus every mission with a coordinate. */
export function presetSites(missions: Mission[]): Site[] {
  const out: Site[] = [SOUTH_POLE];
  for (const m of missions) {
    if (m.lat !== null && m.lon !== null) out.push({ id: m.id, name: m.name, latDeg: m.lat, lonDeg: m.lon });
  }
  return out;
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  success: "SUCCESS",
  partial: "PARTIAL",
  failure: "FAILED",
  planned: "PLANNED",
};
