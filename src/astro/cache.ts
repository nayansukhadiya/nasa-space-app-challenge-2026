import { type MoonState, moonState } from "./frames";

let last: { tMs: number; state: MoonState } | null = null;

/** moonState() memoised on the last instant, so scene + panels computing the same frame share one result. */
export function moonStateAt(tMs: number): MoonState {
  if (last && last.tMs === tMs) return last.state;
  const state = moonState(new Date(tMs));
  last = { tMs, state };
  return state;
}
