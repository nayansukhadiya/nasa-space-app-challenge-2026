"""Real Milky Way sky for the background  ->  public/sky/milkyway.jpg (+ CREDIT.txt)

    python sky.py

Source: Wikimedia Commons "File:ESO - Milky Way.jpg", ESO / S. Brunier, licence CC BY 4.0
(a photographic panorama of the whole sky, equirectangular in GALACTIC coordinates with the Galactic
centre in the middle). The script reads the licence from the Commons API and refuses to continue unless it is
CC BY 4.0, downloads the original into a temporary folder, and writes a 4096x2048 JPEG for the browser.
The scene converts view directions J2000 -> galactic (see src/scene/Sky.tsx), so the stars sit where they really
are relative to the Moon at any simulated time.
"""

from __future__ import annotations

import json
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

TITLE = "File:ESO - Milky Way.jpg"
UA = {"User-Agent": "southwatch/0.1 (nayan31.dev@gmail.com)"}
API = "https://commons.wikimedia.org/w/api.php"

q = urllib.parse.urlencode(
    {
        "action": "query",
        "titles": TITLE,
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiextmetadatafilter": "LicenseShortName|Artist|Credit",
        "format": "json",
    }
)
with urllib.request.urlopen(urllib.request.Request(f"{API}?{q}", headers=UA), timeout=30) as r:
    page = next(iter(json.load(r)["query"]["pages"].values()))
ii = page["imageinfo"][0]
lic = ii["extmetadata"]["LicenseShortName"]["value"]
if lic != "CC BY 4.0":
    raise SystemExit(f"unexpected licence {lic!r}; not using this image")
print(f"{TITLE}: {ii['width']}x{ii['height']}, {ii['size']/1e6:.1f} MB, {lic}")

out = Path(__file__).resolve().parent.parent / "public" / "sky"
out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="sw-sky-") as tmp:
    raw = Path(tmp) / "milkyway-original.jpg"
    with urllib.request.urlopen(urllib.request.Request(ii["url"], headers=UA), timeout=180) as r:
        raw.write_bytes(r.read())
    img = Image.open(raw).convert("RGB")
    img = img.resize((4096, 2048), Image.LANCZOS)
    img.save(out / "milkyway.jpg", quality=88, optimize=True)

(out / "CREDIT.txt").write_text(
    "Milky Way panorama: ESO / S. Brunier, CC BY 4.0.\n"
    "https://commons.wikimedia.org/wiki/File:ESO_-_Milky_Way.jpg\n"
    "Resized to 4096x2048 for web use; colours unchanged.\n"
)
print("wrote", out / "milkyway.jpg", f"({(out / 'milkyway.jpg').stat().st_size/1e6:.1f} MB)")
