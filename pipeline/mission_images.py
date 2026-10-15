"""Attach licensed images (hotlinked from Wikimedia Commons) to public/data/missions.json

    python mission_images.py

For each mission this searches Commons, keeps only the files whose licence is on the allow-list below, and
stores {src (thumbnail URL), caption, credit, license, href} so the UI can show proper attribution. Nothing is
downloaded into the repo; the browser loads the thumbnails from upload.wikimedia.org.

The FIRST image of each mission is the one shown on its card, so the actual spacecraft or rover goes first and
orbiter/site views follow. A top-level "orbiters" list holds real lunar orbiters for the Relay panel.

Allowed licences: public domain (NASA imagery), CC0, CC BY 4.0 / CC BY 2.0, and GODL-India (the Government of
India open licence ISRO uses). Anything else is skipped and reported. "Artist's rendering" captions say so.
"""

from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "southwatch/0.1 (nayan31.dev@gmail.com)"}
ALLOWED = {"Public domain", "CC0", "CC BY 4.0", "CC BY 2.0", "GODL-India"}

# mission id -> [(search query, substring the title must contain, caption)]
SPEC: dict[str, list[tuple[str, str, str]]] = {
    "chandrayaan-3": [
        ("Chandrayaan3-landed", "Chandrayaan3-landed.jpg", "The Vikram lander on the lunar surface, photographed by the Pragyan rover."),
        ("Pragyan rover deployed on the moon", "Pragyan rover deployed on the moon", "The Pragyan rover deployed on the Moon."),
        ("Chandrayaan-3 Landing Site LROC 27 August 2023", "(non-annotated)", "The landing site seen by NASA's Lunar Reconnaissance Orbiter Camera, 27 Aug 2023."),
    ],
    "im-1-odysseus": [
        ("Intuitive Machines Nova-C lunar lander IM 00309 cropped", "Nova-C lunar lander (IM 00309) (cropped)", "The Nova-C lander before launch."),
        ("Odysseus landing site LROC without arrow", "(without arrow)", "The landing site imaged by NASA's Lunar Reconnaissance Orbiter Camera."),
    ],
    "im-2-athena": [
        ("IM-2 Athena Seen Obliquely LROC1408", "IM-2 Athena Seen Obliquely", "Athena on its side, seen obliquely by NASA's Lunar Reconnaissance Orbiter Camera."),
        ("IM-2 Landing Region LROC1401 wac overview", "IM-2 Landing Region", "The IM-2 landing region."),
    ],
    "luna-25": [
        ("Luna-25 impact crater LROC NAC M1447547309R 01", "M1447547309R 01", "The Luna-25 impact crater imaged by NASA's Lunar Reconnaissance Orbiter Camera."),
        ("Luna 25 Impact Site.jpg", "Luna 25 Impact Site.jpg", "The Luna-25 impact site."),
    ],
    "chandrayaan-2-vikram": [
        ("Chandrayaan-2 orbiter and lander", "Chandrayaan-2 orbiter and lander.jpg", "The Chandrayaan-2 orbiter and lander."),
        ("Chandrayaan-2 Vikram lander Impact Ejecta with scalebar", "Impact Ejecta with scalebar", "Impact ejecta from the Vikram lander seen by NASA's Lunar Reconnaissance Orbiter Camera."),
    ],
    "griffin-1": [
        ("Artist's rendering of Astrobotic's Griffin Mission One lunar lander on the surface of the Moon", "Griffin Mission One", "Artist's rendering of the Griffin Mission One lander on the Moon."),
    ],
    "blue-moon-mk1": [
        ("Blue Moon Mark 1 testing cropped", "Blue Moon Mark 1 testing (cropped)", "Blue Moon Mark 1 in testing."),
    ],
}

# Real lunar orbiters, shown on the Relay panel for reference.
ORBITERS: list[dict[str, str]] = [
    {
        "name": "Lunar Reconnaissance Orbiter",
        "agency": "NASA",
        "country": "us",
        "query": "NASA's Lunar Reconnaissance Orbiter (LRO) spacecraft DPLA 4923271eab664eae03f939b74df3dcfa",
        "must": "4923271eab664eae03f939b74df3dcfa",
        "caption": "NASA's Lunar Reconnaissance Orbiter.",
    },
    {
        "name": "Chandrayaan-2 orbiter",
        "agency": "ISRO",
        "country": "in",
        "query": "Chandrayaan-2 orbiter and lander",
        "must": "Chandrayaan-2 orbiter and lander.jpg",
        "caption": "The Chandrayaan-2 orbiter (with the Vikram lander).",
    },
]


def call(params: dict) -> dict:
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


def clean(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def find(query: str, must: str) -> str | None:
    res = call({"action": "query", "list": "search", "srsearch": query, "srnamespace": 6, "srlimit": 20})
    for hit in res["query"]["search"]:
        if must.lower() in hit["title"].lower():
            return hit["title"]
    return None


def details(title: str) -> dict | None:
    d = call(
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiurlwidth": 1000,
            "iiextmetadatafilter": "LicenseShortName|Artist|Credit",
        }
    )
    page = next(iter(d["query"]["pages"].values()))
    ii = (page.get("imageinfo") or [None])[0]
    if not ii:
        return None
    md = ii.get("extmetadata", {})
    return {
        "license": md.get("LicenseShortName", {}).get("value", ""),
        "credit": clean(md.get("Artist", {}).get("value")) or clean(md.get("Credit", {}).get("value")),
        "src": ii.get("thumburl") or ii["url"],
        "href": ii["descriptionurl"],
    }


def image(mid: str, query: str, must: str, caption: str) -> dict | None:
    title = find(query, must)
    if not title:
        print(f"  [{mid}] NOT FOUND: {query}")
        return None
    info = details(title)
    if not info or info["license"] not in ALLOWED:
        print(f"  [{mid}] SKIPPED (licence {info and info['license']!r}): {title}")
        return None
    credit = info["credit"][:90] or "see source"
    print(f"  [{mid}] ok: {title} | {info['license']} | {credit}")
    return {"src": info["src"], "caption": caption, "credit": credit, "license": info["license"], "href": info["href"]}


path = Path(__file__).resolve().parent.parent / "public" / "data" / "missions.json"
data = json.loads(path.read_text(encoding="utf8"))
by_id = {m["id"]: m for m in data["missions"]}

for mid, items in SPEC.items():
    imgs = [i for i in (image(mid, q, m, c) for q, m, c in items) if i]
    by_id[mid]["images"] = imgs

orbiters = []
for o in ORBITERS:
    img = image("orbiter", o["query"], o["must"], o["caption"])
    if img:
        orbiters.append({"name": o["name"], "agency": o["agency"], "country": o["country"], "image": img})
data["orbiters"] = orbiters

path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
print("updated", path)
