"""LOLA global DEM (LDEM_4, 4 px/deg)  ->  public/data/heightmap-global.bin + .meta.json

    python global_dem.py

Source: NASA PDS Geosciences Node, LRO LOLA GDR, cylindrical product
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_4.img
(2,073,600 bytes = 1440 x 720 x int16). From the PDS3 label: LSB signed 16-bit, SCALING_FACTOR 0.5, so
height_m = DN * 0.5 above the 1737.4 km reference sphere; longitude 0..360 east, line 0 = +90 deg latitude,
pixel centres at (j + 0.5) / 4 deg east and 90 - (i + 0.5) / 4 deg latitude.

Output: little-endian float32, 1440 x 720, km above the sphere, same orientation as the source.
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np

URL = (
    "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/"
    "lola_gdr/cylindrical/img/ldem_4.img"
)
W, H = 1440, 720
EXPECTED_BYTES = W * H * 2

out = Path(__file__).resolve().parent.parent / "public" / "data"
out.mkdir(parents=True, exist_ok=True)

with urllib.request.urlopen(URL, timeout=120) as r:
    raw = r.read()
if len(raw) != EXPECTED_BYTES:
    raise SystemExit(f"unexpected size {len(raw)} (expected {EXPECTED_BYTES}); label may have changed")

dn = np.frombuffer(raw, dtype="<i2").reshape(H, W)
km = (dn.astype(np.float64) * 0.5 / 1000.0).astype("<f4")
(out / "heightmap-global.bin").write_bytes(km.tobytes())
meta = {
    "version": 1,
    "width": W,
    "height": H,
    "radiusKm": 1737.4,
    "minKm": float(km.min()),
    "maxKm": float(km.max()),
    "source": "LOLA LDEM_4 (NASA PDS, 4 px/deg global)",
}
(out / "heightmap-global.meta.json").write_text(json.dumps(meta, indent=2) + "\n")
print(f"wrote heightmap-global.bin ({km.nbytes / 1e6:.1f} MB), relief {km.min():.2f} .. {km.max():.2f} km")
