"""NAIF SPICE  ->  src/astro/fixtures/spice-golden.json  (golden values for Vitest)

    uv run python fixtures.py --kernels PATH/TO/kernels

Needs these kernels in --kernels (all from https://naif.jpl.nasa.gov/pub/naif/generic_kernels/):
  naif0012.tls                 leap seconds
  de440s.bsp                   planetary ephemeris (SPK)
  pck/moon_pa_de440_200625.bpc lunar orientation (PCK)
  fk/satellites/moon_de440_220930.tf   defines the MOON_ME frame

Values are geometric (no light-time / stellar-aberration correction) to match the TS engine,
in the Moon mean-Earth/polar-axis (MOON_ME) frame, the frame LOLA data uses. The TS engine uses
the IAU frame; the two differ by ~0.02 deg, well inside the 0.1 deg test tolerance.

NOT YET RUN: needs the SPICE kernels (a download the owner has to approve).
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import spiceypy as spice

R_MOON_KM = 1737.4
N_SAMPLES = 50


def enu_basis(lat: float, lon: float):
    sp, cp, sl, cl = math.sin(lat), math.cos(lat), math.sin(lon), math.cos(lon)
    east = (-sl, cl, 0.0)
    north = (-sp * cl, -sp * sl, cp)
    up = (cp * cl, cp * sl, sp)
    return east, north, up


def look(target_km, lat_deg: float, lon_deg: float):
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    east, north, up = enu_basis(lat, lon)
    site = [R_MOON_KM * u for u in up]
    rel = [t - s for t, s in zip(target_km, site)]
    rng = math.sqrt(sum(c * c for c in rel))
    e = sum(a * b for a, b in zip(rel, east))
    n = sum(a * b for a, b in zip(rel, north))
    u = sum(a * b for a, b in zip(rel, up))
    return {
        "elDeg": math.degrees(math.asin(u / rng)),
        "azDeg": (math.degrees(math.atan2(e, n)) + 360.0) % 360.0,
        "rangeKm": rng,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kernels", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "src" / "astro" / "fixtures" / "spice-golden.json")
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()

    k = args.kernels
    for rel in (
        "naif0012.tls",
        "de440s.bsp",
        "pck/moon_pa_de440_200625.bpc",
        "fk/satellites/moon_de440_220930.tf",
    ):
        spice.furnsh(str(k / rel))

    rng = random.Random(args.seed)
    samples = []
    for _ in range(N_SAMPLES):
        # 2023-2030, latitudes from the pole to the Chandrayaan-3 site latitude band
        epoch_s = rng.uniform(1_672_531_200, 1_893_456_000)
        iso = spice.et2utc(spice.str2et("1970-01-01T00:00:00") + epoch_s, "ISOC", 3)
        et = spice.str2et(iso)
        lat = rng.uniform(-90.0, -65.0)
        lon = rng.uniform(-180.0, 180.0)
        sun, _ = spice.spkpos("SUN", et, "MOON_ME", "NONE", "MOON")
        earth, _ = spice.spkpos("EARTH", et, "MOON_ME", "NONE", "MOON")
        samples.append(
            {
                "utc": iso + "Z",
                "latDeg": lat,
                "lonDeg": lon,
                "sun": look(sun, lat, lon),
                "earth": look(earth, lat, lon),
                "earthMoonKm": math.sqrt(sum(c * c for c in earth)),
            }
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"frame": "MOON_ME", "corrections": "NONE", "samples": samples}, indent=1) + "\n")
    print(f"wrote {len(samples)} samples to {args.out}")


if __name__ == "__main__":
    main()
