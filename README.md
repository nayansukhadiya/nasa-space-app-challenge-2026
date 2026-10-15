# SouthWatch

Mission-control dashboard for the lunar south pole (NASA Space Apps 2026, CLPS Lunar Mission Browser).
Scrub through UTC time and see where the Sun shines, when Earth is in view, how long a signal takes to reach
home, and how real south-polar landings fared. Every number is tagged **MEASURED**, **COMPUTED** or **MODELED**.

Static Next.js export; all real-time math runs in the browser. No server, no database, no API key.

```bash
pnpm install
pnpm dev --port 3100   # http://localhost:3100
pnpm test              # Vitest
pnpm build             # static export to ./out
```

## Data (all public, no key)

| Layer | Source | In the repo |
| --- | --- | --- |
| Terrain, 600 km around the pole, 391 m/px | LOLA `LDEM_80S_80MPP_ADJ` (NASA PGDA) | `public/data/heightmap.bin` |
| Terrain, 1300 km (≈60°S cap), 1 km/px, for context + far horizons | LOLA `LDEM_60S_120MPP_ADJ` (NASA PGDA) | `public/data/heightmap-wide.bin` |
| Terrain, whole Moon, 4 px/deg (~7.6 km) | LOLA `LDEM_4` (NASA PDS Geosciences Node) | `public/data/heightmap-global.bin` (`pipeline/global_dem.py`) |
| Imagery draped on the terrain | LRO WAC mosaics via NASA Moon Trek WMTS (south-pole + global), fetched live in the browser | none (live tiles) |
| Sky | ESO / S. Brunier Milky Way panorama, CC BY 4.0, oriented by the Moon's true rotation | `public/sky/milkyway.jpg` (`pipeline/sky.py`) |
| Earth | NASA Blue Marble Next Generation (equirectangular, public domain), at its real position and distance, turned by Earth's real sidereal rotation | `public/sky/earth.jpg` (`pipeline/earth.py`) |
| Mission images | Wikimedia Commons (NASA/LRO public domain, ISRO GODL-India), hotlinked with credit | none (`pipeline/mission_images.py` writes `missions.json`) |

Regenerate terrain (reads only the needed window of the cloud-optimised GeoTIFF over HTTP):

```bash
cd pipeline
uv venv --python 3.12 .venv && uv pip install --python .venv/Scripts/python.exe numpy rasterio pyproj spiceypy
.venv/Scripts/python.exe -I dem.py https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF \
  --source "LOLA LDEM_80S_80MPP_ADJ (NASA PGDA, 80 m/px, ±300 km window)" --size 1536 --extent-km 600
.venv/Scripts/python.exe -I dem.py https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_120MPP_ADJ.TIF \
  --source "LOLA LDEM_60S_120MPP_ADJ (NASA PGDA, 120 m/px source, ±650 km window)" --size 1280 --extent-km 1300 --stem heightmap-wide
```

`dem.py` verifies the DEM's projection against the app's convention and aborts on nodata.

## What is real, and what is not

| Piece | State |
| --- | --- |
| Astro engine (`src/astro/`): Moon-fixed frame, Sun/Earth look angles, horizon masking, light time, sweeps | Built, tested |
| Terrain-masked horizons from real LOLA data (great-circle ray march over detail + wide maps) | Built, tested on analytic terrain; registration checked against known features (Cabeus deep, Malapert high, no mirroring) |
| 3D / 2D scene, real imagery, lat/lon + km grids, click-to-probe, Chandrayaan-3 replay | Built |
| Whole-Moon globe, north up with the south pole at the bottom (frames: Pole / 60°S / Moon), pure black space with real stars, real Earth at its true distance, Sun as the light source, earthshine on the night side (display aid) | Built. Sky and Earth orientation tested against astronomy-engine |
| Ground view: stand at the selected site, drag to look, Look at Earth / Sun / N E S W, real horizon | Built |
| Google-Earth-style controls (home, zoom, tilt, turn), eye altitude, look-at coordinates, scale bar | Built |
| Shareable URL state (`?view=ground&frame=cap&tab=illumination&t=2023-08-23T12:33:00Z&site=chandrayaan-3`) | Built |
| Mission cards with real spacecraft/rover photos, flags, hotlinked licensed images with credit; real orbiters on the Relay tab; clickable data sources | Built |
| Mini 3D Moon (top right): follows the main view, real terminator, sub-Earth point | Built |
| UI: floating frosted-glass panels, tabbed and compact (one sub-tab at a time); Aetrova logo; Tomorrow / Plus Jakarta Sans / Space Grotesk | Built |
| Horizons away from the poles | Use the 7.6 km global grid (labelled "coarse"); real ones need a regional DEM |
| Agency logos | Flags only; official logos are trademarks, drop files in `public/agencies/` and set `agencyLogo` |
| Comms: light time (ms/s/min), round trip, free-space path loss at S/X/Ka | Built, tested |
| Solar: sun-disc visible fraction, irradiance on a Sun-facing / flat panel (**MODELED**) | Built, tested |
| Relay orbit simulation (two-body Kepler, 3 generic polar orbits, pass windows, Moon occlusion) (**MODELED**) | Built, tested. The orbits are generic concepts, **not** any real mission |
| SPICE golden tests | Test written and **skipped** until `pipeline/fixtures.py` has produced `src/astro/fixtures/spice-golden.json` (needs ~45 MB of NAIF kernels) |
| Mission coordinates / dates | Best-known approximations, flagged `verify` in `public/data/missions.json` |
| Mission images | Slots are ready: drop files in `public/missions/<id>/` and list them in `images` |
| Artemis III candidate regions | **Missing**: coordinates must come from the NASA source |
| Comparison with published illumination maps (Mazarico et al. 2011) | Not done |

Without a DEM the scene shows a flat patch and a banner; `?synthetic` loads invented relief for development,
always bannered. It is never lunar data.

## Layout

```
src/astro/       pure TS science, no React/Three imports (tested)
src/terrain/     projection, heightmaps (detail + composite), horizon computation, NASA tile loader
src/scene/       R3F scene: curved terrain meshes, sun light, camera, grids, markers
src/workers/     Comlink worker: horizon masks, illumination sweeps, relay pass windows
src/store/       Zustand: sim clock/UI state, world data
src/components/  dashboard panels
pipeline/        offline Python: DEM -> heightmaps, SPICE -> golden fixtures
```

## Science notes

- Frame chain: EQJ → Moon-fixed (IAU: `R3(W)·R1(90°−δ)·R3(90°+α)` from astronomy-engine's `RotationAxis`) → local
  East/North/Up at the site → elevation/azimuth, compared with the terrain horizon at that azimuth.
- "Lit" means the upper limb of the solar disc clears the horizon. "Earth visible" means Earth's centre does.
- Illumination % depends strongly on the window: the Sun's elevation swings ±1.5° over a year at the pole, so the
  panel shows both calendar 2026 and the scrubber window. Neither is the multi-year average in the literature.
- Positions are geometric (no light-time/aberration); the omitted terms are far below 0.1°.
- The scene mesh is the true curved surface, so one directional light along the real Sun vector shadows it exactly.
  Vertical exaggeration >1× is scene-only and breaks that agreement; the UI says so.
- Relay orbits: pole-aligned inertial frame → Moon-fixed by the prime-meridian angle; no mascons, no third bodies.
