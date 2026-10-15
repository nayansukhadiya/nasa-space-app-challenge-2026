import * as Comlink from "comlink";
import type { TerrainWorkerApi } from "./terrain.worker";

let remote: Comlink.Remote<TerrainWorkerApi> | null = null;

/** Lazy singleton: the worker is only created in the browser, on first use. */
export function terrainWorker(): Comlink.Remote<TerrainWorkerApi> {
  if (!remote) {
    const w = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" });
    remote = Comlink.wrap<TerrainWorkerApi>(w);
  }
  return remote;
}

export { Comlink };
