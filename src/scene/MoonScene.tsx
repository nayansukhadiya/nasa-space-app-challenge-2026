"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import { moonStateAt } from "@/astro/cache";
import { horizonElevationDeg } from "@/astro/horizon";
import { localBasis, lookAngles } from "@/astro/site";
import { DEG, MOON_RADIUS_KM } from "@/astro/constants";
import { add, scale, unit } from "@/astro/vec";
import { type FrameMode, useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import type { HeightSource, Heightmap } from "@/terrain/heightmap";
import { makeSyntheticHeightmap } from "@/terrain/synthetic";
import { dirToScene, sceneToLatLon, surfacePoint } from "./frame";
import { buildGlobeGeometry } from "./globeGeometry";
import { buildGrid } from "./graticule";
import { sitePositionKm } from "@/astro/site";
import { sub } from "@/astro/vec";
import { RELAY_PRESETS } from "@/astro/relay";
import { stationStates } from "@/astro/stations";
import { useSelectedEntry, useThrottledT } from "@/lib/hooks";
import { computeLink } from "@/lib/linkCalc";
import { useMastMask } from "@/lib/useMastMask";
import { useLink } from "@/store/link";
import { useBlendedCanvas } from "@/store/layers";
import { markerBus } from "./markerBus";
import { Sky } from "./Sky";
import { buildTerrainGeometry } from "./terrainGeometry";
import { cameraBus } from "./cameraBus";
import { viewBus } from "./viewBus";

const R = MOON_RADIUS_KM;
const CENTER = new THREE.Vector3(0, -R, 0);

/** Advances the simulation clock while playing. */
function SimClock() {
  useFrame((_, dt) => {
    const s = useSim.getState();
    if (s.playing) s.advance(Math.min(dt, 0.1));
  });
  return null;
}

/** Click on the moon → probe that lat/lon (ignores drags). */
function probeAt(e: ThreeEvent<MouseEvent>) {
  if (e.delta > 4) return; // that was a drag (orbit/pan), not a click
  e.stopPropagation();
  const [lat, lon] = sceneToLatLon(e.point.x, e.point.y, e.point.z);
  const site = { id: "probe", name: "Probe", latDeg: Number(lat.toFixed(3)), lonDeg: Number(lon.toFixed(3)) };
  void useWorld
    .getState()
    .addSite(site)
    .then(() => useSim.getState().selectSite("probe"));
}

function useCanvasTexture(canvas: HTMLCanvasElement | null): THREE.CanvasTexture | null {
  const texture = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [canvas]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function Terrain({
  map,
  canvas,
  holeHalfKm = 0,
  dropKm = 0,
  maxVerts = 768,
}: {
  map: Heightmap;
  canvas: HTMLCanvasElement | null;
  holeHalfKm?: number;
  dropKm?: number;
  maxVerts?: number;
}) {
  const exaggeration = useSim((s) => s.exaggeration);
  const surface = useSim((s) => s.surface);
  const geometry = useMemo(
    () => buildTerrainGeometry(map, exaggeration, Math.max(1, Math.ceil(map.meta.size / maxVerts)), holeHalfKm, dropKm),
    [map, exaggeration, maxVerts, holeHalfKm, dropKm],
  );
  const texture = useCanvasTexture(canvas);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const useImagery = surface === "imagery" && texture !== null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow onClick={probeAt}>
      <meshStandardMaterial
        key={useImagery ? "tex" : "flat"}
        color={useImagery ? "#ffffff" : "#9b9b97"}
        map={useImagery ? texture : null}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * The whole Moon: a 0.5° mesh displaced by the global LOLA grid and textured with the global WAC mosaic,
 * with a hole where the finer polar meshes sit, over a dark backdrop sphere that fills any hairline gap.
 */
function Globe({ terrain, holeHalfKm }: { terrain: HeightSource; holeHalfKm: number }) {
  const exaggeration = useSim((s) => s.exaggeration);
  const surface = useSim((s) => s.surface);
  const canvas = useBlendedCanvas("global");
  const geometry = useMemo(() => buildGlobeGeometry(terrain, exaggeration, holeHalfKm), [terrain, exaggeration, holeHalfKm]);
  const texture = useCanvasTexture(canvas);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const useImagery = surface === "imagery" && texture !== null;
  return (
    <>
      <mesh geometry={geometry} onClick={probeAt}>
        <meshStandardMaterial
          key={useImagery ? "tex" : "flat"}
          color={useImagery ? "#ffffff" : "#9b9b97"}
          map={useImagery ? texture : null}
          roughness={1}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, -R, 0]}>
        <sphereGeometry args={[R - 12, 96, 64]} />
        <meshStandardMaterial color="#111111" roughness={1} />
      </mesh>
    </>
  );
}

/** Lat/lon graticule or km grid, draped on the surface (detail first, wide beyond, global elsewhere). */
function Grid({ terrain }: { terrain: HeightSource }) {
  const grid = useSim((s) => s.grid);
  const k = useSim((s) => s.exaggeration);
  const geometry = useMemo(() => {
    const { segments } = buildGrid(terrain, grid, k);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(segments, 3));
    return g;
  }, [terrain, grid, k]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (grid === "off") return null;
  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      <lineBasicMaterial color="#ffffff" transparent opacity={0.26} depthWrite={false} />
    </lineSegments>
  );
}

/**
 * Earthshine: the night side is lit faintly by the Earth. Brightness follows Earth's real phase seen from the
 * Moon, (1 − ŝ·ê)/2 (full Earth at new Moon). It is boosted far above the physical ~1e-4 of sunlight so the
 * night side stays readable on screen; it is a display aid, not a measurement.
 */
function Earthshine() {
  const light = useRef<THREE.AmbientLight>(null);
  useFrame(() => {
    const st = moonStateAt(useSim.getState().tMs);
    const s = unit(st.sunKm);
    const e = unit(st.earthKm);
    const phase = (1 - (s[0] * e[0] + s[1] * e[1] + s[2] * e[2])) / 2;
    if (light.current) light.current.intensity = 0.02 + 0.09 * phase;
  });
  return <ambientLight ref={light} intensity={0.05} />;
}

/** The Sun: one directional light along the real Moon→Sun vector, in the Moon-fixed frame. */
function SunLight({ extentKm }: { extentKm: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const half = extentKm * 0.78;
  // The curved surface sags (half²/2R) below the pole plane, so the vertical shadow range must cover that.
  const vertical = (extentKm / 2) ** 2 / (2 * R) + 25;

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = -half;
    c.right = half;
    c.top = vertical;
    c.bottom = -vertical;
    c.near = 1;
    c.far = half * 4;
    c.updateProjectionMatrix();
  }, [half, vertical]);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const dir = dirToScene(unit(moonStateAt(useSim.getState().tMs).sunKm));
    l.position.set(dir[0] * half * 2, dir[1] * half * 2, dir[2] * half * 2);
    l.target.position.set(0, 0, 0);
    l.target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={light}
      castShadow
      intensity={8}
      color="#fff8ee"
      shadow-mapSize={[4096, 4096]}
      shadow-bias={-0.0002}
      shadow-normalBias={0.15}
    />
  );
}

/**
 * Per frame: project every marker to screen space (hiding those on the far side of the Moon), and
 * publish where the camera is looking (plus eye altitude and scale) for the mini-map and the readout.
 */
function ViewTracker() {
  const v = useMemo(() => new THREE.Vector3(), []);
  const n = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const oc = useMemo(() => new THREE.Vector3(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera, size }) => {
    for (const item of markerBus.items) {
      const el = markerBus.els.get(item.id);
      if (!el) continue;
      n.set(item.pos[0], item.pos[1], item.pos[2]).sub(CENTER).normalize();
      dir.copy(camera.position).sub(v.set(item.pos[0], item.pos[1], item.pos[2]));
      const facing = n.dot(dir) > 0;
      v.set(item.pos[0], item.pos[1], item.pos[2]).project(camera);
      const visible = facing && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.display = visible ? "" : "none";
      if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }

    oc.copy(camera.position).sub(CENTER);
    viewBus.eyeAltKm = Math.max(0, oc.length() - R);

    // Camera ray ∩ Moon sphere → the point being looked at.
    camera.getWorldDirection(dir);
    const b = oc.dot(dir);
    const c = oc.lengthSq() - R * R;
    const disc = b * b - c;
    if (disc < 0) {
      viewBus.valid = false;
      return;
    }
    const t = -b - Math.sqrt(disc);
    hit.copy(camera.position).addScaledVector(dir, t);
    const [lat, lon] = sceneToLatLon(hit.x, hit.y, hit.z);
    const half = t * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360);
    viewBus.valid = true;
    viewBus.latDeg = lat;
    viewBus.lonDeg = lon;
    viewBus.spanDeg = Math.min(90, Math.max(0.5, (half / R) * (180 / Math.PI)));
    viewBus.kmPerPx = (2 * half) / size.height;
  });
  return null;
}

/**
 * Camera pose in "orbit" terms with NORTH UP (camera.up = −Y in scene axes, because the pole is at +Y):
 *   theta = polar angle from the lunar north axis (π = looking from above the south pole),
 *   phi   = azimuth about the polar axis (0 = camera on the far-side side of the pole, so the 0° meridian is up;
 *           π = camera on the near side, the usual full-Moon view with the south pole at the BOTTOM),
 *   r     = distance from the orbit target (the pole, or the Moon's centre for the globe frame).
 * Offset from the target: (−r·sinθ·sinφ, −r·cosθ, r·sinθ·cosφ).
 */
interface Pose {
  ty: number;
  theta: number;
  phi: number;
  r: number;
}

const wrapPi = (a: number): number => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

function poseFor(frame: FrameMode, view: "3d" | "2d" | "ground", detailKm: number, capKm: number, fovDeg: number): Pose {
  const top = Math.PI - 0.0001; // straight down on the pole
  if (frame === "globe") {
    // Near side toward us, north up, tipped slightly so the south pole sits near the bottom of the disc.
    return view === "2d"
      ? { ty: -R, theta: top, phi: 0, r: R * 3.4 }
      : { ty: -R, theta: 1.82, phi: Math.PI, r: R * 3.4 };
  }
  const span = frame === "cap" ? capKm : detailKm;
  return view === "2d"
    ? { ty: 0, theta: top, phi: 0, r: (span / 2 / Math.tan((fovDeg * Math.PI) / 360)) * 1.08 }
    : { ty: 0, theta: Math.PI - 1.0, phi: 0, r: span * 1.5 };
}

/** Tweens the one camera between frames (pole, cap, whole Moon), 3D and 2D, and serves the on-screen buttons. */
function CameraRig({ detailKm, capKm }: { detailKm: number; capKm: number }) {
  const view = useSim((s) => s.view);
  const frame = useSim((s) => s.frame);
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  type Goal = Pose & { tx: number; tz: number; busy: boolean };
  const goal = useRef<Goal>({ ty: 0, tx: 0, tz: 0, theta: Math.PI - 1, phi: 0, r: detailKm * 1.5, busy: false });
  const first = useRef(true);

  const place = (target: THREE.Vector3, theta: number, phi: number, r: number) => {
    camera.position.set(
      target.x - r * Math.sin(theta) * Math.sin(phi),
      target.y - r * Math.cos(theta),
      target.z + r * Math.sin(theta) * Math.cos(phi),
    );
    camera.lookAt(target);
  };

  const current = (): Goal => {
    const t = controls.current?.target ?? new THREE.Vector3();
    const dx = camera.position.x - t.x;
    const dy = camera.position.y - t.y;
    const dz = camera.position.z - t.z;
    const r = Math.hypot(dx, dy, dz);
    return {
      tx: t.x,
      tz: t.z,
      ty: t.y,
      theta: Math.acos(THREE.MathUtils.clamp(-dy / Math.max(r, 1e-6), -1, 1)),
      phi: Math.atan2(-dx, dz),
      r,
      busy: false,
    };
  };

  const limits = (f: FrameMode): [number, number] =>
    f === "globe" ? [0.02, Math.PI - 0.02] : [Math.PI / 2 + 0.03, Math.PI - 0.0001];

  useEffect(() => {
    const pose = poseFor(frame, view, detailKm, capKm, camera.fov);
    goal.current = { ...pose, tx: 0, tz: 0, busy: !first.current };
    const c = controls.current;
    if (first.current && c) {
      first.current = false;
      c.target.set(0, pose.ty, 0);
      place(c.target, pose.theta, pose.phi, pose.r);
    }
    if (c) {
      const [lo, hi] = limits(frame);
      c.minPolarAngle = lo;
      c.maxPolarAngle = hi;
      c.enableRotate = view === "3d";
      c.maxDistance = R * 14;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, frame, detailKm, capKm, camera]);

  // Google-Earth-style buttons + fly-to
  useEffect(() => {
    // Presses accumulate on the pose we are already heading to, so rapid clicks add up.
    const base = (): Goal => (goal.current.busy ? goal.current : current());
    const aim = (patch: Partial<Goal>) => {
      const [lo, hi] = limits(useSim.getState().frame);
      const g = { ...base(), ...patch };
      g.theta = THREE.MathUtils.clamp(g.theta, lo, hi);
      g.r = THREE.MathUtils.clamp(g.r, 5, R * 14);
      goal.current = { tx: g.tx, tz: g.tz, ty: g.ty, theta: g.theta, phi: g.phi, r: g.r, busy: true };
    };
    cameraBus.zoom = (f) => aim({ r: base().r * f });
    cameraBus.tilt = (d) => aim({ theta: base().theta + d });
    cameraBus.turn = (d) => aim({ phi: base().phi + d });
    cameraBus.home = () => {
      const s = useSim.getState();
      goal.current = { ...poseFor(s.frame, s.view, detailKm, capKm, camera.fov), tx: 0, tz: 0, busy: true };
    };
    cameraBus.flyTo = (latDeg, lonDeg, opts) => {
      const p = surfacePoint(latDeg, lonDeg, 0, 1);
      const b = base();
      const wantR = opts?.distanceKm ?? Math.min(b.r, Math.max(60, detailKm * 0.35));
      aim({
        tx: p[0],
        ty: p[1],
        tz: p[2],
        r: wantR,
        // Tip slightly toward the horizon so the focused site reads as terrain, not a top-down map.
        theta: Math.min(Math.max(b.theta, Math.PI - 1.1), Math.PI - 0.35),
      });
    };
    return () => {
      cameraBus.zoom = cameraBus.tilt = cameraBus.turn = cameraBus.home = () => {};
      cameraBus.flyTo = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailKm, capKm, camera]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g.busy) return;
    const c = controls.current;
    if (!c) return;
    // Frame-rate independent easing: ~95 % of the way there in about 0.6 s on any machine.
    const k = 1 - Math.exp(-Math.min(dt, 0.25) * 5);
    const cur = current();
    const dphi = wrapPi(g.phi - cur.phi);
    const theta = cur.theta + (g.theta - cur.theta) * k;
    const phi = cur.phi + dphi * k;
    const r = cur.r + (g.r - cur.r) * k;
    const target = c.target;
    target.set(target.x + (g.tx - target.x) * k, target.y + (g.ty - target.y) * k, target.z + (g.tz - target.z) * k);
    place(target, theta, phi, r);
    if (
      Math.abs(g.theta - theta) < 0.002 &&
      Math.abs(dphi) * (1 - k) < 0.002 &&
      Math.abs(g.r - r) < 0.5 + g.r * 0.002 &&
      Math.abs(g.ty - target.y) < 0.5 &&
      Math.abs(g.tx - target.x) < 0.5 &&
      Math.abs(g.tz - target.z) < 0.5
    ) {
      g.busy = false;
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={Math.PI / 2 + 0.03}
      maxPolarAngle={Math.PI - 0.0001}
      minDistance={5}
      maxDistance={R * 14}
      zoomToCursor
    />
  );
}


/** Set near plane and field of view (kept in a helper so the three.js camera is mutated outside React's hook rules). */
function setLens(cam: THREE.PerspectiveCamera, near: number, fov: number): void {
  cam.near = near;
  cam.fov = fov;
  cam.updateProjectionMatrix();
}

const GROUND_EYE_KM = 0.03; // 30 m above the DEM: clear of the coarse mesh, close enough to read as "standing there"
const wrapDeg = (a: number): number => ((((a + 180) % 360) + 360) % 360) - 180;

/**
 * Ground view: stand at the selected site and look around with the real terrain horizon, the real Earth, the
 * Sun and the stars. Drag to look, wheel to zoom (field of view), buttons to face Earth / Sun / a compass point.
 * Replaces the orbit rig while active (OrbitControls would otherwise overwrite the camera every frame).
 */
function GroundRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const siteId = useSim((s) => s.selectedSiteId);
  const entry = useWorld((s) => (siteId ? s.sites[siteId] : undefined));
  const k = useSim((s) => s.exaggeration);
  const pose = useRef({ az: 0, pitch: 4, fov: 62, tAz: 0, tPitch: 4, tFov: 62 });
  const m = useMemo(() => new THREE.Matrix4(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const upC = useMemo(() => new THREE.Vector3(), []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);

  const faceTarget = (what: "earth" | "sun" | "n" | "e" | "s" | "w", snap: boolean) => {
    if (!entry) return;
    const st = moonStateAt(useSim.getState().tMs);
    let az = 0;
    let pitch = 6;
    if (what === "earth" || what === "sun") {
      const la = lookAngles(what === "earth" ? st.earthKm : st.sunKm, entry.site);
      az = la.azDeg;
      pitch = Math.min(45, Math.max(0, la.elDeg) + 3);
    } else {
      az = { n: 0, e: 90, s: 180, w: 270 }[what];
    }
    const p = pose.current;
    p.tAz = az;
    p.tPitch = pitch;
    if (snap) {
      p.az = az;
      p.pitch = pitch;
    }
  };

  // Enter: near plane down to 10 m, wider lens; start by facing Earth if it is above the horizon, else the Sun.
  useEffect(() => {
    setLens(camera, 0.01, pose.current.fov);
    return () => setLens(camera, 0.5, 35);
  }, [camera]);

  useEffect(() => {
    if (!entry) return;
    const st = moonStateAt(useSim.getState().tMs);
    const e = lookAngles(st.earthKm, entry.site);
    faceTarget(e.elDeg > horizonElevationDeg(entry.mask, e.azDeg) ? "earth" : "sun", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.site.id]);

  useEffect(() => {
    cameraBus.look = (w) => faceTarget(w, false);
    cameraBus.fov = (f) => {
      pose.current.tFov = THREE.MathUtils.clamp(pose.current.tFov * f, 12, 100);
    };
    return () => {
      cameraBus.look = () => {};
      cameraBus.fov = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.site.id]);

  // Drag to look (the scene follows the pointer), wheel to zoom.
  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const degPerPx = pose.current.fov / Math.max(300, el.clientHeight);
      pose.current.tAz -= (e.clientX - drag.x) * degPerPx;
      pose.current.tPitch = THREE.MathUtils.clamp(pose.current.tPitch + (e.clientY - drag.y) * degPerPx, -35, 85);
      pose.current.az = pose.current.tAz;
      pose.current.pitch = pose.current.tPitch;
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      pose.current.tFov = THREE.MathUtils.clamp(pose.current.tFov * Math.exp(e.deltaY * 0.0012), 12, 100);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((_, dt) => {
    if (!entry) return;
    const p = pose.current;
    const kk = 1 - Math.exp(-Math.min(dt, 0.25) * 8);
    p.az += wrapDeg(p.tAz - p.az) * kk;
    p.pitch += (p.tPitch - p.pitch) * kk;
    p.fov += (p.tFov - p.fov) * kk;
    if (Math.abs(camera.fov - p.fov) > 0.01) setLens(camera, camera.near, p.fov);

    const { latDeg, lonDeg } = entry.site;
    const b = localBasis(latDeg, lonDeg);
    const a = p.az * DEG;
    const pr = p.pitch * DEG;
    const horiz = add(scale(b.east, Math.sin(a)), scale(b.north, Math.cos(a)));
    const f = dirToScene(add(scale(horiz, Math.cos(pr)), scale(b.up, Math.sin(pr))));
    const u = dirToScene(b.up);
    fwd.set(f[0], f[1], f[2]).normalize();
    up.set(u[0], u[1], u[2]);
    right.crossVectors(fwd, up).normalize();
    upC.crossVectors(right, fwd).normalize();
    m.makeBasis(right, upC, fwd.clone().negate());
    camera.quaternion.setFromRotationMatrix(m);
    const pos = surfacePoint(latDeg, lonDeg, (entry.site.heightKm ?? 0) + GROUND_EYE_KM / k, k);
    camera.position.set(pos[0], pos[1], pos[2]);
  });

  return null;
}

/**
 * The link in 3D. A mast stands on the selected site (drawn at a fixed visual scale: a real 5 m mast would be
 * invisible at this zoom, but its height drives the horizon the physics uses). The beam leaves the mast top toward the
 * DSN station that can actually hear the site (or Earth's centre when none can), looks faint when blocked, solid when
 * a link is available and teal when it locks. While the sim runs, pulses travel both ways. The pulse speed is for
 * the eye only: real light takes 1.28 s to cross 384,000 km.
 */
const BEAM_LEN_KM = 900;
const PULSES = 7;

function SimBeam() {
  const entry = useSelectedEntry();
  const tMs = useThrottledT(500);
  const link = useLink();
  const relayId = useSim((s) => s.relayId);
  const orbit = RELAY_PRESETS.find((o) => o.id === relayId) ?? null;
  const { mask } = useMastMask(entry, link.mastM);
  const live = useMemo(
    () => (entry && mask ? computeLink(entry.site, mask, link, tMs, link.path === "relay" ? orbit : null) : null),
    [entry, mask, link, tMs, orbit],
  );
  // The frame loop reads this ref, so React only re-renders on the throttled clock.
  const state = useRef({ available: false, locked: false, stationId: null as string | null, running: false, mastM: 5 });
  useEffect(() => {
    state.current = {
      available: !!live?.available,
      locked: !!live && live.available && live.down.locked && live.up.locked,
      stationId: live?.station?.id ?? null,
      running: link.running,
      mastM: link.mastM,
    };
  }, [live, link.running, link.mastM]);

  const mast = useRef<THREE.Line>(null);
  const beam = useRef<THREE.Line>(null);
  const tip = useRef<THREE.Mesh>(null);
  const foot = useRef<THREE.Mesh>(null);
  const beamMat = useRef<THREE.LineBasicMaterial>(null);
  const pulses = useRef<Array<THREE.Mesh | null>>([]);
  const mkLine = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  };
  const mastGeom = useMemo(() => mkLine(), []);
  const beamGeom = useMemo(() => mkLine(), []);
  useEffect(
    () => () => {
      mastGeom.dispose();
      beamGeom.dispose();
    },
    [mastGeom, beamGeom],
  );

  useFrame(({ clock }) => {
    const siteId = useSim.getState().selectedSiteId;
    const e = siteId ? useWorld.getState().sites[siteId] : undefined;
    const lm = mast.current;
    const lb = beam.current;
    const tp = tip.current;
    const ft = foot.current;
    if (!e || !lm || !lb || !tp || !ft) return;
    const st = state.current;
    const h = e.site.heightKm ?? 0;
    const base = surfacePoint(e.site.latDeg, e.site.lonDeg, h, 1);
    const up = surfacePoint(e.site.latDeg, e.site.lonDeg, h + 1, 1);
    const ux = up[0] - base[0];
    const uy = up[1] - base[1];
    const uz = up[2] - base[2];
    const mastKm = 4 + st.mastM * 0.2; // visual scale
    const top: [number, number, number] = [base[0] + ux * mastKm, base[1] + uy * mastKm, base[2] + uz * mastKm];

    const ma = mastGeom.getAttribute("position") as THREE.BufferAttribute;
    ma.setXYZ(0, base[0], base[1], base[2]);
    ma.setXYZ(1, top[0], top[1], top[2]);
    ma.needsUpdate = true;
    ft.position.set(base[0], base[1], base[2]);
    tp.position.set(top[0], top[1], top[2]);

    // Aim: the chosen station, else Earth's centre.
    const sim = moonStateAt(useSim.getState().tMs);
    const siteKm = sitePositionKm(e.site.latDeg, e.site.lonDeg, h);
    const target = st.stationId
      ? (stationStates(sim).find((x) => x.station.id === st.stationId)?.posKm ?? sim.earthKm)
      : sim.earthKm;
    const dir = dirToScene(unit(sub(target, siteKm)));
    const ba = beamGeom.getAttribute("position") as THREE.BufferAttribute;
    ba.setXYZ(0, top[0], top[1], top[2]);
    ba.setXYZ(1, top[0] + dir[0] * BEAM_LEN_KM, top[1] + dir[1] * BEAM_LEN_KM, top[2] + dir[2] * BEAM_LEN_KM);
    ba.needsUpdate = true;

    const t = clock.elapsedTime;
    const live3 = st.available;
    if (beamMat.current) {
      beamMat.current.color.set(st.locked ? "#2fdccf" : "#cfd8d6");
      beamMat.current.opacity = !live3 ? 0.1 : st.running ? 0.55 + 0.25 * Math.sin(t * 6) : st.locked ? 0.5 : 0.3;
    }
    (tp.material as THREE.MeshBasicMaterial).color.set(st.locked ? "#2fdccf" : "#ffffff");
    tp.scale.setScalar(Math.max(0.6, 1 + (st.running && live3 ? 0.3 * Math.sin(t * 6) : 0)));

    // Pulses: down = Moon→Earth, up = Earth→Moon (reverse), spread along the beam.
    const show = st.running && live3;
    for (let i = 0; i < PULSES; i++) {
      const m = pulses.current[i];
      if (!m) continue;
      m.visible = show;
      if (!show) continue;
      const down = i % 2 === 0;
      const phase = (t * 0.35 + i / PULSES) % 1;
      const f = down ? phase : 1 - phase;
      m.position.set(top[0] + dir[0] * BEAM_LEN_KM * f, top[1] + dir[1] * BEAM_LEN_KM * f, top[2] + dir[2] * BEAM_LEN_KM * f);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(down ? "#2fdccf" : "#ffffff");
      mat.opacity = 0.9 * Math.sin(Math.PI * phase);
    }
  });

  return (
    <>
      {/* @ts-expect-error R3F line primitive */}
      <line ref={mast} geometry={mastGeom}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
      </line>
      {/* @ts-expect-error R3F line primitive */}
      <line ref={beam} geometry={beamGeom}>
        <lineBasicMaterial ref={beamMat} transparent opacity={0.22} depthWrite={false} />
      </line>
      <mesh ref={foot}>
        <sphereGeometry args={[0.9, 12, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh ref={tip}>
        <sphereGeometry args={[2.2, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {Array.from({ length: PULSES }).map((_, i) => (
        <mesh key={i} ref={(m) => void (pulses.current[i] = m)} visible={false}>
          <sphereGeometry args={[1.8, 10, 10]} />
          <meshBasicMaterial color="#2fdccf" transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

export default function MoonScene() {
  const map = useWorld((s) => s.map);
  const wideMap = useWorld((s) => s.wideMap);
  const globalMap = useWorld((s) => s.globalMap);
  const terrain = useWorld((s) => s.terrain);
  const view = useSim((s) => s.view);
  const imagery = useBlendedCanvas("detail");
  const imageryWide = useBlendedCanvas("wide");
  // With no DEM we draw a flat reference patch of the sphere: honest, and labelled in the UI.
  const flat = useMemo(() => makeSyntheticHeightmap(129, 600, []), []);
  const shown = map ?? flat;
  const detailKm = shown.meta.extentKm;
  const capKm = wideMap?.meta.extentKm ?? detailKm;
  const holeHalf = (wideMap ? capKm : detailKm) / 2 - 2;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 35, near: 0.5, far: 1_000_000, up: [0, -1, 0], position: [0, 400, 600] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, logarithmicDepthBuffer: true }}
      style={{ background: "transparent" }}
    >
      <SimClock />
      <Sky />
      <Earthshine />
      <SunLight extentKm={capKm} />
      <Terrain map={shown} canvas={imagery} />
      {wideMap && (
        // Context ring: omit the cells the detail mesh covers, and sit 0.25 km lower so overlaps never z-fight.
        <Terrain map={wideMap} canvas={imageryWide} holeHalfKm={detailKm / 2 - 2} dropKm={0.25} maxVerts={700} />
      )}
      {terrain && globalMap && <Globe terrain={terrain} holeHalfKm={holeHalf} />}
      {terrain && view !== "ground" && <Grid terrain={terrain} />}
      {terrain && view !== "ground" && <SimBeam />}
      <ViewTracker />
      {view === "ground" ? <GroundRig /> : <CameraRig detailKm={detailKm} capKm={capKm} />}
    </Canvas>
  );
}
