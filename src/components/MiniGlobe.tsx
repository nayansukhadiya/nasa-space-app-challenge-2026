"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { moonStateAt } from "@/astro/cache";
import { DEG } from "@/astro/constants";
import { fmtLat, fmtLon } from "@/lib/format";
import { unitSphere } from "@/scene/sphere";
import { viewBus } from "@/scene/viewBus";
import { useSim } from "@/store/sim";
import { useWorld } from "@/store/world";
import { Glass } from "./ui";

const fromLatLon = (latDeg: number, lonDeg: number, out = new THREE.Vector3()): THREE.Vector3 =>
  out.set(
    Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG),
    Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG),
    Math.sin(latDeg * DEG),
  );

/** Points of a small circle of angular radius `a` (radians) about unit vector `c`, on a sphere of radius `r`. */
function circlePoints(c: THREE.Vector3, a: number, r: number, n: number, out: Float32Array): void {
  const ref = Math.abs(c.z) < 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(c, ref).normalize();
  const v = new THREE.Vector3().crossVectors(c, u);
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const x = c.x * Math.cos(a) + (u.x * Math.cos(t) + v.x * Math.sin(t)) * Math.sin(a);
    const y = c.y * Math.cos(a) + (u.y * Math.cos(t) + v.y * Math.sin(t)) * Math.sin(a);
    const z = c.z * Math.cos(a) + (u.z * Math.cos(t) + v.z * Math.sin(t)) * Math.sin(a);
    out[k * 3] = x * r;
    out[k * 3 + 1] = y * r;
    out[k * 3 + 2] = z * r;
  }
}

const RING_N = 72;

function GlobeScene() {
  const canvas = useWorld((s) => s.imageryGlobal.canvas);
  const geometry = useMemo(() => unitSphere(1), []);
  const texture = useMemo(() => {
    if (!canvas) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [canvas]);
  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const sun = useRef<THREE.DirectionalLight>(null);
  const site = useRef<THREE.Mesh>(null);
  const earth = useRef<THREE.LineLoop>(null);
  const sunMark = useRef<THREE.Mesh>(null);
  const footprint = useRef<THREE.LineLoop>(null);
  const cur = useRef(new THREE.Vector3(0, 0, -1));
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const ringBuf = useMemo(() => new Float32Array(RING_N * 3), []);
  const earthBuf = useMemo(() => new Float32Array(24 * 3), []);

  const footprintGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RING_N * 3), 3));
    return g;
  }, []);
  const earthGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    return g;
  }, []);

  useFrame(({ camera }) => {
    const sim = useSim.getState();
    const st = moonStateAt(sim.tMs);

    // light = the real Sun direction in the Moon-fixed frame
    if (sun.current) {
      const s = st.sunKm;
      const n = Math.hypot(s[0], s[1], s[2]);
      sun.current.position.set((s[0] / n) * 10, (s[1] / n) * 10, (s[2] / n) * 10);
    }

    // follow the main camera's view point (or the selected site if the view ray misses the Moon)
    const entry = sim.selectedSiteId ? useWorld.getState().sites[sim.selectedSiteId] : null;
    if (viewBus.valid) fromLatLon(viewBus.latDeg, viewBus.lonDeg, tmp);
    else if (entry) fromLatLon(entry.site.latDeg, entry.site.lonDeg, tmp);
    else tmp.copy(cur.current);
    cur.current.lerp(tmp, 0.12).normalize();
    const c = cur.current;
    camera.position.copy(c).multiplyScalar(3.1);
    if (Math.abs(c.z) < 0.97) camera.up.set(0, 0, 1);
    else camera.up.set(1, 0, 0);
    camera.lookAt(0, 0, 0);

    // visible-area footprint
    if (footprint.current) {
      const a = viewBus.valid ? Math.min(viewBus.spanDeg, 89) * DEG : 0.2;
      circlePoints(c, a, 1.006, RING_N, ringBuf);
      (footprintGeo.getAttribute("position") as THREE.BufferAttribute).array.set(ringBuf);
      (footprintGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }

    // selected site
    if (site.current) {
      if (entry) {
        fromLatLon(entry.site.latDeg, entry.site.lonDeg, tmp).multiplyScalar(1.012);
        site.current.position.copy(tmp);
        site.current.visible = true;
      } else site.current.visible = false;
    }

    // sub-solar point: where the Sun stands at the zenith
    if (sunMark.current) {
      const q = st.sunKm;
      const nq = Math.hypot(q[0], q[1], q[2]);
      sunMark.current.position.set((q[0] / nq) * 1.015, (q[1] / nq) * 1.015, (q[2] / nq) * 1.015);
    }

    // sub-Earth point: where Earth stands at the zenith
    if (earth.current) {
      const e = st.earthKm;
      const n = Math.hypot(e[0], e[1], e[2]);
      tmp.set(e[0] / n, e[1] / n, e[2] / n);
      circlePoints(tmp, 0.07, 1.006, 24, earthBuf);
      (earthGeo.getAttribute("position") as THREE.BufferAttribute).array.set(earthBuf);
      (earthGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight ref={sun} intensity={3.2} color="#fff8ee" />
      <mesh geometry={geometry}>
        <meshStandardMaterial color={texture ? "#ffffff" : "#8a8f8e"} map={texture} roughness={1} metalness={0} />
      </mesh>
      <lineLoop ref={footprint} geometry={footprintGeo}>
        <lineBasicMaterial color="#2fdccf" />
      </lineLoop>
      <lineLoop ref={earth} geometry={earthGeo}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </lineLoop>
      <mesh ref={sunMark}>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshBasicMaterial color="#fff6d6" toneMapped={false} />
      </mesh>
      <mesh ref={site}>
        <sphereGeometry args={[0.03, 16, 12]} />
        <meshBasicMaterial color="#2fdccf" />
      </mesh>
    </>
  );
}

/** Mini 3D Moon (top right): the whole Moon with the real terminator, following where the main view is. */
export function MiniGlobe() {
  const [text, setText] = useState("—");
  useEffect(() => {
    const id = setInterval(() => {
      setText(viewBus.valid ? `${fmtLat(viewBus.latDeg)} ${fmtLon(((viewBus.lonDeg + 540) % 360) - 180)}` : "—");
    }, 250);
    return () => clearInterval(id);
  }, []);
  return (
    <Glass className="sw-mini" aria-label="Mini map of the Moon">
      <div className="sw-mini-head">
        <span className="sw-label">Location</span>
        <span className="sw-mini-coord">{text}</span>
      </div>
      <div className="sw-mini-canvas">
        <Canvas dpr={[1, 2]} camera={{ fov: 28, near: 0.1, far: 50, position: [0, 0, -3.1] }} gl={{ antialias: true, alpha: true }}>
          <GlobeScene />
        </Canvas>
      </div>
      <div className="sw-mini-legend">
        <span>
          <i className="sw-dot" /> site
        </span>
        <span>
          <i className="sw-ring acc" /> view
        </span>
        <span>
          <i className="sw-ring" /> Earth zenith
        </span>
        <span>
          <i className="sw-sun" /> Sun zenith
        </span>
      </div>
    </Glass>
  );
}
