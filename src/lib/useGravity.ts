"use client";

import { useEffect, useState } from "react";
import { DEGREE2_FIELD, type GravityField, loadGravityField } from "@/astro/gravity";
import { terrainWorker } from "@/workers/client";

let cached: GravityField | null = null;
let inflight: Promise<GravityField> | null = null;

/** Load `public/data/gravity.json` (the pipeline's GRAIL field) once; fall back to the built-in degree-2 truncation. */
function resolveField(): Promise<GravityField> {
  if (cached) return Promise.resolve(cached);
  inflight ??= loadGravityField().then((f) => {
    cached = f ?? DEGREE2_FIELD;
    // the numerical orbits in the worker should use the same field the panels quote
    void terrainWorker().setGravity(cached);
    return cached;
  });
  return inflight;
}

/** The lunar gravity field in use. Starts as the degree-2 truncation and upgrades if a fuller field is shipped. */
export function useGravityField(): GravityField {
  const [field, setField] = useState<GravityField>(cached ?? DEGREE2_FIELD);
  useEffect(() => {
    let live = true;
    void resolveField().then((f) => live && setField(f));
    return () => {
      live = false;
    };
  }, []);
  return field;
}
