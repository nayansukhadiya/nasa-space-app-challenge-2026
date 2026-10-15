import { create } from "zustand";
import { DEFAULT_POWER, type PowerParams } from "@/astro/power";

export type LinkPath = "direct" | "relay";

/** Everything the user can change in the communication simulation. All numbers are simulation INPUTS, not mission data. */
export interface LinkSettings {
  /** Antenna mast height above the ground at the base, metres. Raising it lowers the terrain horizon. */
  mastM: number;
  path: LinkPath;
  /** Earth → Moon carrier, GHz. */
  upGHz: number;
  /** Moon → Earth carrier, GHz. */
  downGHz: number;
  moonDishM: number;
  moonTxW: number;
  earthDishM: number;
  earthTxW: number;
  /** Moon → Earth data rate, kbit/s. */
  downRateKbps: number;
  /** Earth → Moon (command) data rate, kbit/s. */
  upRateKbps: number;
  /** Eb/N0 the modulation + coding needs, dB. */
  requiredEbN0Db: number;
  tSysMoonK: number;
  tSysEarthK: number;
  /** Cable, polarisation and feed losses, dB (pointing loss is added separately). */
  miscLossDb: number;
  moonPointErrDeg: number;
  earthPointErrDeg: number;
  /** Is the simulation running (beam drawn, pulses animated)? */
  running: boolean;
  power: PowerParams;
}

export const DEFAULT_LINK: LinkSettings = {
  mastM: 5,
  path: "direct",
  upGHz: 7.17,
  downGHz: 8.42,
  moonDishM: 0.6,
  moonTxW: 20,
  earthDishM: 34,
  earthTxW: 20_000,
  downRateKbps: 10_000,
  upRateKbps: 2,
  requiredEbN0Db: 2.5,
  tSysMoonK: 300,
  tSysEarthK: 40,
  miscLossDb: 1,
  moonPointErrDeg: 0.5,
  earthPointErrDeg: 0.005,
  running: false,
  power: DEFAULT_POWER,
};

/** Nominal band centres for the presets (context only; not any mission's allocation). */
export const BAND_PRESETS = [
  { name: "S", up: 2.1, down: 2.25 },
  { name: "X", up: 7.17, down: 8.42 },
  { name: "Ka", up: 22.5, down: 26 },
] as const;

interface LinkState extends LinkSettings {
  set: (patch: Partial<Omit<LinkSettings, "power">>) => void;
  setPower: (patch: Partial<PowerParams>) => void;
  reset: () => void;
}

export const useLink = create<LinkState>((set) => ({
  ...DEFAULT_LINK,
  set: (patch) => set(patch),
  setPower: (patch) => set((s) => ({ power: { ...s.power, ...patch } })),
  reset: () => set({ ...DEFAULT_LINK }),
}));
