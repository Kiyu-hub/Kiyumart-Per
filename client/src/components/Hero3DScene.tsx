import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Stars } from "@react-three/drei";
import * as THREE from "three";

// ─── Tier system ──────────────────────────────────────────────────────────────
// 1 = dedicated GPU (custom GLSL particles + distort orbs + scroll parallax)
// 2 = integrated/mid GPU (PointsMaterial + simpler orbs + idle rotation)
// 3 = no WebGL / low-end (pure CSS fallback — existing mv-bg classes)

type RenderTier = 1 | 2 | 3;

function detectInitialTier(): RenderTier {
  if (typeof window === "undefined") return 3;
  try {
    const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return 3;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      if (/Intel|Mesa|Software|llvmpipe|SwiftShader/i.test(renderer)) return isMobile ? 3 : 2;
      return isMobile ? 2 : 1;
    }
    return isMobile ? 2 : 2;
  } catch {
    return 3;
  }
}

// Module-level scroll tracker shared across all scene sub-components
const scrollY = { current: 0 };

// ─── Liquid particle field ────────────────────────────────────────────────────
const VERT_SHADER = `
  uniform float uTime;
  uniform float uScrollY;
  attribute vec3 color;
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    // Animate waves on each axis
    pos.y += sin(pos.x * 1.8 + uTime * 0.7) * 0.42 + cos(pos.z * 1.3 + uTime * 0.5) * 0.26;
    pos.x += sin(pos.z * 1.5 + uTime * 0.4) * 0.18;
    // Scroll parallax — particles drift upward as user scrolls
    pos.y -= uScrollY * 0.0018;
    pos.x += uScrollY * 0.0004 * sign(pos.z);

    vColor = color;
    vAlpha = clamp(0.25 + abs(sin(pos.x * 1.2 + uTime * 0.25)) * 0.6, 0.12, 0.88);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    float depth = max(-(modelViewMatrix * vec4(pos, 1.0)).z, 0.5);
    gl_PointSize = max(1.2, 3.2 * (8.0 / depth));
  }
`;

const FRAG_SHADER = `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.28, 0.5, d);
    gl_FragColor = vec4(vColor, soft * vAlpha * 0.82);
  }
`;

function ParticleField({ count, tier, isDark }: { count: number; tier: RenderTier; isDark: boolean }) {
  const meshRef = useRef<THREE.Points>(null!);
  const spread  = window.innerWidth < 768 ? 12 : 22;

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.55;
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.35 - 2;
      const t = Math.random();
      if (isDark) {
        // Deep blue → indigo → violet (subtle glow in dark)
        col[i * 3]     = 0.08 + t * 0.30;
        col[i * 3 + 1] = 0.18 + t * 0.30;
        col[i * 3 + 2] = 0.55 + t * 0.38;
      } else {
        // Sky blue → periwinkle → soft violet (light mode)
        col[i * 3]     = 0.42 + t * 0.35;
        col[i * 3 + 1] = 0.52 + t * 0.28;
        col[i * 3 + 2] = 0.88 + t * 0.12;
      }
    }
    return { positions: pos, colors: col };
  }, [count, spread, isDark]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors,    3));
    return geo;
  }, [positions, colors]);

  const uniforms = useMemo(() => ({
    uTime:    { value: 0 },
    uScrollY: { value: 0 },
  }), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (tier === 1) {
      const mat = meshRef.current.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value    = clock.getElapsedTime();
      mat.uniforms.uScrollY.value = scrollY.current;
    } else {
      const t = clock.getElapsedTime();
      meshRef.current.rotation.y = t * 0.022;
      meshRef.current.rotation.x = Math.sin(t * 0.016) * 0.04;
    }
  });

  if (tier === 1) {
    return (
      <points ref={meshRef} geometry={geometry}>
        <shaderMaterial
          vertexShader={VERT_SHADER}
          fragmentShader={FRAG_SHADER}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    );
  }

  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial
        size={0.075}
        vertexColors
        transparent
        opacity={isDark ? 0.52 : 0.42}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─── Iridescent floating orbs ─────────────────────────────────────────────────
type OrbDef = { pos: [number, number, number]; scale: number; distort: number; speed: number; color: string };

function FloatingOrbs({ tier, isDark }: { tier: RenderTier; isDark: boolean }) {
  const orbDefs = ([
    { pos: [-4.8, 2.8,  -6], scale: 2.1, distort: 0.48, speed: 0.65, color: isDark ? "#1e3a8a" : "#93c5fd" },
    { pos: [ 5.2,-2.2,  -9], scale: 2.6, distort: 0.32, speed: 0.40, color: isDark ? "#4c1d95" : "#c4b5fd" },
    { pos: [ 0.4, 3.6, -14], scale: 3.6, distort: 0.55, speed: 0.28, color: isDark ? "#0c4a6e" : "#7dd3fc" },
  ] as OrbDef[]).slice(0, tier === 1 ? 3 : 2);

  return (
    <>
      {orbDefs.map((o, i) => (
        <Float key={i} speed={o.speed} rotationIntensity={0.22} floatIntensity={1.3}>
          <mesh position={o.pos} scale={o.scale}>
            <sphereGeometry args={[1, 28, 28]} />
            <MeshDistortMaterial
              color={o.color}
              distort={o.distort}
              speed={0.38}
              transparent
              opacity={isDark ? 0.075 : 0.058}
              depthWrite={false}
            />
          </mesh>
        </Float>
      ))}
    </>
  );
}

// ─── Gold accent ring (Tier 1 only) ──────────────────────────────────────────
const RING_VERT = `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.z += sin(uv.x * 6.28 * 3.0 + uTime * 0.8) * 0.06;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const RING_FRAG = `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float ring = abs(sin(vUv.x * 6.28 * 1.5 + uTime * 0.6));
    vec3 gold = mix(vec3(0.72, 0.55, 0.18), vec3(0.98, 0.82, 0.42), ring);
    float alpha = ring * 0.18;
    gl_FragColor = vec4(gold, alpha);
  }
`;

function GoldAccentRing() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    (meshRef.current.material as THREE.ShaderMaterial).uniforms.uTime.value = clock.getElapsedTime();
    meshRef.current.rotation.z = clock.getElapsedTime() * 0.12;
    meshRef.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.08) * 0.15;
  });

  return (
    <mesh ref={meshRef} position={[2.5, -1, -4]}>
      <torusGeometry args={[2.8, 0.015, 8, 120]} />
      <shaderMaterial
        vertexShader={RING_VERT}
        fragmentShader={RING_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── Camera scroll parallax ───────────────────────────────────────────────────
function ScrollCamera() {
  const { camera } = useThree();
  useFrame(() => {
    const sy = scrollY.current;
    camera.position.y += (-sy * 0.0013 - camera.position.y) * 0.05;
    camera.position.x += ( sy * 0.00035 - camera.position.x) * 0.05;
  });
  return null;
}

// ─── FPS auto-downgrade (Phase 3) ────────────────────────────────────────────
function FPSMonitor({ onDowngrade }: { onDowngrade: () => void }) {
  const count  = useRef(0);
  const start  = useRef(performance.now());
  const locked = useRef(false);

  useFrame(() => {
    if (locked.current) return;
    count.current++;
    const now = performance.now();
    if (now - start.current >= 3000) {
      const fps = count.current / ((now - start.current) / 1000);
      if (fps < 55) { locked.current = true; onDowngrade(); }
      count.current = 0;
      start.current = now;
    }
  });
  return null;
}

// ─── Full 3D scene (renders inside Canvas) ───────────────────────────────────
function Scene3D({ tier, isDark, onDowngrade }: { tier: RenderTier; isDark: boolean; onDowngrade: () => void }) {
  return (
    <>
      <FPSMonitor onDowngrade={onDowngrade} />
      <ScrollCamera />
      <ambientLight intensity={0.06} />
      <ParticleField count={tier === 1 ? 4200 : 1400} tier={tier} isDark={isDark} />
      <FloatingOrbs tier={tier} isDark={isDark} />
      {tier === 1 && <GoldAccentRing />}
      {isDark && (
        <Stars
          radius={75}
          depth={55}
          count={tier === 1 ? 2000 : 700}
          factor={3.5}
          saturation={0}
          fade
          speed={0.35}
        />
      )}
    </>
  );
}

// ─── CSS fallback (Tier 3 / error) ───────────────────────────────────────────
function CSSFallback() {
  return (
    <div className="overflow-hidden absolute inset-0 pointer-events-none">
      <div className="mv-bg-gradient" />
      <div className="mv-bg-orb mv-bg-orb-1" />
      <div className="mv-bg-orb mv-bg-orb-2" />
      <div className="mv-bg-orb mv-bg-orb-3" />
    </div>
  );
}

// ─── Error boundary ───────────────────────────────────────────────────────────
class WebGLBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <CSSFallback /> : this.props.children; }
}

// ─── Exported component ───────────────────────────────────────────────────────
export default function Hero3DScene() {
  const [tier, setTier]       = useState<RenderTier>(detectInitialTier);
  const [isDark, setIsDark]   = useState(() => document.documentElement.classList.contains("dark"));
  const [fatalError, setFatal] = useState(false);

  // Track dark-mode class changes
  useEffect(() => {
    const mo = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark"))
    );
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Single passive scroll listener shared across scene sub-components
  useEffect(() => {
    const onScroll = () => { scrollY.current = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleDowngrade = useCallback(() => {
    setTier(t => (t === 1 ? 2 : 3));
  }, []);

  if (tier === 3 || fatalError) return <CSSFallback />;

  return (
    <WebGLBoundary onError={() => setFatal(true)}>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
        aria-hidden="true"
      >
        <Canvas
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "default",
            failIfMajorPerformanceCaveat: false,
          }}
          camera={{ position: [0, 0, 9], fov: 55 }}
          style={{ background: "transparent", width: "100%", height: "100%" }}
          onCreated={({ gl }) => gl.setClearColor(0, 0)}
        >
          <Suspense fallback={null}>
            <Scene3D tier={tier} isDark={isDark} onDowngrade={handleDowngrade} />
          </Suspense>
        </Canvas>
      </div>
    </WebGLBoundary>
  );
}
