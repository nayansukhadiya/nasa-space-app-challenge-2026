"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { moonStateAt } from "@/astro/cache";
import { EARTH_RADIUS_KM } from "@/astro/constants";
import { unit } from "@/astro/vec";
import { useSim } from "@/store/sim";
import { dirToScene, toScene } from "./frame";
import { unitSphere } from "./sphere";
import { earthToScene, sceneToGalactic } from "./skyMatrix";

export const SKY_CREDIT = "Milky Way: ESO / S. Brunier, CC BY 4.0";
export const EARTH_CREDIT = "Earth: NASA Blue Marble";

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// View direction (scene axes) → galactic axes → equirectangular lookup.
// Galactic longitude increases to the LEFT with the Galactic centre in the middle (checked against the
// panorama: the LMC sits right of centre at l≈280°, M31 left at l≈121°).
// The gamma lifts only bright stars and the Milky Way core; the faint noise floor goes to true black.
const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform mat3 uToGalactic;
  uniform float uExposure;
  varying vec3 vDir;
  const float PI = 3.14159265359;
  void main() {
    vec3 g = normalize(uToGalactic * normalize(vDir));
    float l = atan(g.y, g.x);
    float b = asin(clamp(g.z, -1.0, 1.0));
    vec2 uv = vec2(0.5 - l / (2.0 * PI), 0.5 + b / PI);
    vec3 c = pow(texture2D(uMap, uv).rgb * uExposure, vec3(1.45));
    gl_FragColor = vec4(c, 1.0);
  }
`;

const SKY_RADIUS = 40_000; // km; drawn first with depth test off, so only its direction matters
const SUN_DISTANCE = 900_000; // km, inside the far plane; follows the camera so it has no parallax
const SUN_RADIUS = SUN_DISTANCE * Math.tan((0.2665 * Math.PI) / 180);

function useTexture(url: string, srgb: boolean): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 4;
      if (live) setTexture(t);
    });
    return () => {
      live = false;
    };
  }, [url, srgb]);
  return texture;
}

/**
 * The real sky: a photographic Milky Way panorama oriented by the Moon's true rotation (so the stars drift
 * as simulated time advances), the Sun as a disc in its true direction (the same direction the light comes
 * from), and the Earth at its REAL position, 384 400 km-ish away, with the NASA Blue Marble texture turned
 * by Earth's real sidereal rotation and lit by that same Sun light, so its phase is right by construction.
 */
export function Sky() {
  const camera = useThree((s) => s.camera);
  const stars = useTexture("/sky/milkyway.jpg", false);
  const earthTex = useTexture("/sky/earth.jpg", true);
  const sphere = useRef<THREE.Mesh>(null);
  const sun = useRef<THREE.Mesh>(null);
  const earth = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const earthGeometry = useMemo(() => unitSphere(1.5), []);
  useEffect(() => () => earthGeometry.dispose(), [earthGeometry]);
  const [uniforms] = useState(() => ({
    uMap: { value: null as THREE.Texture | null },
    uToGalactic: { value: new THREE.Matrix3() },
    uExposure: { value: 1.35 },
  }));

  useFrame(() => {
    const tMs = useSim.getState().tMs;
    const date = new Date(tMs);
    const u = material.current?.uniforms;
    if (u) {
      if (u.uMap.value !== stars) u.uMap.value = stars;
      const m = sceneToGalactic(date);
      (u.uToGalactic.value as THREE.Matrix3).set(
        m[0][0], m[0][1], m[0][2],
        m[1][0], m[1][1], m[1][2],
        m[2][0], m[2][1], m[2][2],
      );
    }
    sphere.current?.position.copy(camera.position);

    const st = moonStateAt(tMs);
    const s = dirToScene(unit(st.sunKm));
    sun.current?.position.set(
      camera.position.x + s[0] * SUN_DISTANCE,
      camera.position.y + s[1] * SUN_DISTANCE,
      camera.position.z + s[2] * SUN_DISTANCE,
    );

    const e = earth.current;
    if (e) {
      const m = earthToScene(date);
      const p = toScene(st.earthKm); // real position: Moon→Earth vector, with the scene origin at the pole
      const k = EARTH_RADIUS_KM; // equatorial radius; the 0.3 % flattening is invisible here
      e.matrix.set(
        m[0][0] * k, m[0][1] * k, m[0][2] * k, p[0],
        m[1][0] * k, m[1][1] * k, m[1][2] * k, p[1],
        m[2][0] * k, m[2][1] * k, m[2][2] * k, p[2],
        0, 0, 0, 1,
      );
      e.matrixWorldNeedsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={sphere} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS, 64, 32]} />
        <shaderMaterial
          ref={material}
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={sun} frustumCulled={false}>
        <sphereGeometry args={[SUN_RADIUS, 24, 16]} />
        <meshBasicMaterial color="#fffdf5" toneMapped={false} />
      </mesh>
      <mesh ref={earth} geometry={earthGeometry} matrixAutoUpdate={false} frustumCulled={false}>
        {/* The scene's Sun light is tuned for the Moon's grazing sunlight; Earth faces it fully, so scale it down
            to keep its texture from saturating (a display exposure choice, not a measurement). */}
        <meshStandardMaterial
          key={earthTex ? "tex" : "flat"}
          map={earthTex}
          color={earthTex ? "#b4b4b4" : "#26456b"}
          roughness={0.95}
          metalness={0}
        />
      </mesh>
    </>
  );
}
