"""LOLA south-polar DEM  ->  public/data/heightmap.bin + heightmap.meta.json

    uv run python dem.py PATH/TO/LDEM_80S_xxxx.TIF --source "LOLA LDEM_80S_xxxx (NASA PDS)"

The output matches what src/terrain/heightmap.ts expects:
  * size x size little-endian float32, heights in km above the 1737.4 km sphere
  * row 0 is the +y edge; x = rho*sin(lon), y = rho*cos(lon) (south-polar stereographic,
    scale 1 at the pole), centred on the pole
  * heightmap.meta.json with size / extentKm / radiusKm / minKm / maxKm / source

This script refuses to guess: --source must be given (it is shown in the UI as the
MEASURED provenance), the DEM's CRS orientation is verified against known points,
and any nodata inside the window aborts the run.

Verified against LDEM_80S_80MPP_ADJ.TIF (7600x7600 float32 metres, +/-304 km, NaN nodata).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

MOON_RADIUS_KM = 1737.4


def check_projection(src: rasterio.DatasetReader) -> None:
    """The app assumes x = rho*sin(lon), y = rho*cos(lon), rho = 2R*tan(pi/4 + lat/2)."""
    crs = CRS.from_user_input(src.crs)
    geo = CRS.from_proj4(f"+proj=longlat +R={MOON_RADIUS_KM * 1000} +no_defs")
    to_xy = Transformer.from_crs(geo, crs, always_xy=True)

    x0, y0 = to_xy.transform(0.0, -85.0)  # 85S, 0E: expect x ~ 0, y > 0
    x90, y90 = to_xy.transform(90.0, -85.0)  # 85S, 90E: expect x > 0, y ~ 0
    rho = 2 * MOON_RADIUS_KM * 1000 * math.tan(math.pi / 4 + math.radians(-85.0) / 2)
    tol = 50.0  # metres
    ok = (
        abs(x0) < tol
        and abs(y0 - rho) < tol
        and abs(x90 - rho) < tol
        and abs(y90) < tol
    )
    if not ok:
        raise SystemExit(
            "DEM projection does not match the app's convention "
            f"(85S,0E -> ({x0:.1f},{y0:.1f}) m, 85S,90E -> ({x90:.1f},{y90:.1f}) m; "
            f"expected rho={rho:.1f} m on +y / +x). Reproject the DEM first."
        )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dem", help="LOLA south-polar GeoTIFF: a local path or an https URL (read with HTTP range requests; COG)")
    ap.add_argument("--source", required=True, help="provenance string shown in the UI (product id + origin)")
    ap.add_argument("--size", type=int, default=1024, help="output pixels per side (default 1024)")
    ap.add_argument("--extent-km", type=float, default=600.0, help="full width of the square window, km")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply raw values to get metres (e.g. 0.5 for 0.5 m/DN int16)")
    ap.add_argument("--stem", default="heightmap", help="output file stem: <stem>.bin / <stem>.meta.json")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "public" / "data")
    args = ap.parse_args()

    path = f"/vsicurl/{args.dem}" if args.dem.startswith("http") else args.dem
    env = rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".TIF,.tif",
        GDAL_HTTP_TIMEOUT="120",
    )
    with env, rasterio.open(path) as src:
        check_projection(src)
        half_m = args.extent_km * 500.0
        win = from_bounds(-half_m, -half_m, half_m, half_m, transform=src.transform)
        data = src.read(
            1,
            window=win,
            out_shape=(args.size, args.size),
            resampling=Resampling.average,
            boundless=False,
            masked=True,
        )
        print(f"read window {args.extent_km:.0f} km at {args.extent_km*1000/args.size:.0f} m/px from {src.width}x{src.height} source")

    if np.ma.is_masked(data) and data.mask.any():
        bad = int(data.mask.sum())
        raise SystemExit(f"{bad} nodata pixels inside the window; choose a smaller --extent-km inside the DEM footprint.")

    km = (np.asarray(data, dtype=np.float64) * args.scale / 1000.0).astype("<f4")
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"{args.stem}.bin").write_bytes(km.tobytes())
    meta = {
        "version": 1,
        "size": args.size,
        "extentKm": args.extent_km,
        "radiusKm": MOON_RADIUS_KM,
        "minKm": float(km.min()),
        "maxKm": float(km.max()),
        "source": args.source,
    }
    (args.out / f"{args.stem}.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {args.out/(args.stem + '.bin')} ({km.nbytes/1e6:.1f} MB), relief {km.min():.2f} .. {km.max():.2f} km")


if __name__ == "__main__":
    main()
