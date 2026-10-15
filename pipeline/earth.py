"""Real Earth for the sky  ->  public/sky/earth.jpg (+ CREDIT-earth.txt)

    python earth.py

Source: Wikimedia Commons "File:Blue Marble Next Generation + topography + bathymetry.jpg", NASA Earth Observatory Blue Marble (public domain),
equirectangular, longitude -180..180, north up. The script verifies the licence is public domain before using it.
The scene lights this texture with the same Sun light as the Moon, so the phase seen from the Moon is right,
and rotates it with Earth's real sidereal rotation.
"""

from __future__ import annotations

import json
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

TITLE = "File:Blue Marble Next Generation + topography + bathymetry.jpg"
UA = {"User-Agent": "southwatch/0.1 (nayan31.dev@gmail.com)"}
API = "https://commons.wikimedia.org/w/api.php"

q = urllib.parse.urlencode(
    {
        "action": "query",
        "titles": TITLE,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiextmetadatafilter": "LicenseShortName|Artist",
        "format": "json",
    }
)
with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=30) as r:
    page = next(iter(json.load(r)["query"]["pages"].values()))
ii = page["imageinfo"][0]
lic = ii["extmetadata"]["LicenseShortName"]["value"]
if lic != "Public domain":
    raise SystemExit(f"unexpected licence {lic!r}; not using this image")
print(f"{TITLE}: {ii['width']}x{ii['height']}, {ii['size']/1e6:.1f} MB, {lic}")

out = Path(__file__).resolve().parent.parent / "public" / "sky"
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="sw-earth-") as tmp:
    raw = Path(tmp) / "earth-original.jpg"
    with urllib.request.urlopen(urllib.request.Request(ii["url"], headers=UA), timeout=180) as r:
        raw.write_bytes(r.read())
    img = Image.open(raw).convert("RGB")
    if img.size[0] != 2 * img.size[1]:
        raise SystemExit(f"not an equirectangular 2:1 map: {img.size}")
    if img.size[0] > 4096:
        img = img.resize((4096, 2048), Image.LANCZOS)
    img.save(out / "earth.jpg", quality=88, optimize=True)

(out / "CREDIT-earth.txt").write_text(
    "Earth: NASA Earth Observatory, Blue Marble Next Generation (public domain).\n"
    "https://commons.wikimedia.org/wiki/File:Blue_Marble_Next_Generation_%2B_topography_%2B_bathymetry.jpg\n"
)
print("wrote", out / "earth.jpg", f"({(out / 'earth.jpg').stat().st_size/1e6:.1f} MB)")
