/**
 * KiyuHero3D — VNTANA-style cinematic hero section
 * Left column: kinetic headline + magnetic CTAs + live stat counters
 * Right column: iridescent R3F gem with orbiting ring, sparkles, mouse parallax
 * Floating glassmorphism cards overlaid on canvas
 * GSAP scroll-exit: gem shrinks + fades as user scrolls away
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

gsap.registerPlugin(ScrollTrigger);

// ─── GLSL: Iridescent liquid-gold gem ────────────────────────────────────────
const GEM_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3  vNormal;
  varying vec3  vWorldPos;
  varying float vFresnel;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec3 viewDir = normalize(-mvPos.xyz);
    vFresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;
const GEM_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3  vNormal;
  varying vec3  vWorldPos;
  varying float vFresnel;
  void main() {
    float sweep = vFresnel * 6.28318 + uTime * 0.38;
    vec3 spectral = vec3(
      0.55 + 0.45 * cos(sweep),
      0.55 + 0.45 * cos(sweep + 2.09440),
      0.55 + 0.45 * cos(sweep + 4.18879)
    );
    vec3 gold = vec3(1.0, 0.80, 0.28);
    vec3 col = mix(spectral, gold, 0.42);
    float rim = pow(vFresnel, 2.2);
    col += rim * gold * 2.0;
    col += pow(1.0 - vFresnel, 3.0) * vec3(0.12, 0.05, 0.32);
    float spark = max(0.0, sin(dot(vWorldPos, vec3(8.1, 12.4, 9.7)) + uTime * 3.2));
    col += pow(spark, 9.0) * vec3(2.2, 1.7, 1.0);
    gl_FragColor = vec4(col, 0.90 + rim * 0.10);
  }
`;

// ─── GLSL: Pulsing golden orbit ring ─────────────────────────────────────────
const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RING_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec2  vUv;
  void main() {
    float glow = 0.5 + 0.5 * sin(uTime * 1.9 + vUv.x * 6.28318);
    vec3 gold = vec3(1.0, 0.74, 0.22);
    gl_FragColor = vec4(gold, glow * 0.52);
  }
`;

// ─── 3D: Gem mesh ─────────────────────────────────────────────────────────────
function GemMesh() {
  const ref      = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current.rotation.y = t * 0.20;
    ref.current.rotation.x = Math.sin(t * 0.13) * 0.18;
    (ref.current.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  });
  return (
    <Float speed={0.9} floatIntensity={0.7} rotationIntensity={0.12}>
      <mesh ref={ref} scale={1.85}>
        <icosahedronGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={GEM_VERT}
          fragmentShader={GEM_FRAG}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>
    </Float>
  );
}

// ─── 3D: Orbiting golden ring ─────────────────────────────────────────────────
function GemRing() {
  const ref      = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current.rotation.z = t * 0.24;
    ref.current.rotation.x = 0.32 + Math.sin(t * 0.11) * 0.06;
    (ref.current.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[2.7, 0.020, 8, 128]} />
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

// ─── 3D: Second thinner ring (perpendicular) ──────────────────────────────────
function GemRing2() {
  const ref      = useRef<THREE.Mesh>(null!);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current.rotation.z = -t * 0.16;
    ref.current.rotation.y = 1.5708 + Math.sin(t * 0.09) * 0.08;
    (ref.current.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[3.4, 0.010, 6, 100]} />
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

// ─── 3D: Orbiting point light ─────────────────────────────────────────────────
function OrbitLight() {
  const ref = useRef<THREE.PointLight>(null!);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ref.current.position.set(
      Math.cos(t * 0.65) * 3.8,
      Math.sin(t * 0.45) * 2.6,
      Math.sin(t * 0.65) * 3.8,
    );
  });
  return <pointLight ref={ref} intensity={4} color="#ffd98e" distance={14} />;
}

// ─── 3D: Mouse parallax camera ────────────────────────────────────────────────
function MouseCamera() {
  const { camera } = useThree();
  const m = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const h = (e: MouseEvent) => {
      m.current.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      m.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, []);
  useFrame(() => {
    camera.position.x += (m.current.x * 1.1 - camera.position.x) * 0.045;
    camera.position.y += (m.current.y * 0.7 - camera.position.y) * 0.045;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ─── Full 3D scene ────────────────────────────────────────────────────────────
function GemScene() {
  return (
    <>
      <ambientLight intensity={0.14} />
      <OrbitLight />
      <pointLight position={[-4.5, 3.5, 2]} intensity={1.5} color="#9bb4ff" />
      <pointLight position={[3, -3, -2]} intensity={0.8} color="#ff9de2" />
      <GemMesh />
      <GemRing />
      <GemRing2 />
      <Sparkles count={90} scale={6} size={1.3} speed={0.28} opacity={0.75} color="#ffd88e" />
      <Sparkles count={40} scale={4} size={0.8} speed={0.18} opacity={0.5} color="#b4d0ff" />
      <MouseCamera />
    </>
  );
}

// ─── Animated stat counter ────────────────────────────────────────────────────
function StatCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  const numRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const match = value.match(/^(\d[\d,]*)(.*)/);
    if (!match) return;
    const num    = parseInt(match[1].replace(/,/g, ""), 10);
    const suffix = match[2] ?? "";
    const obj    = { n: 0 };
    gsap.to(obj, {
      n: num, duration: 2.4, ease: "power2.out",
      onUpdate: () => { el.textContent = Math.round(obj.n).toLocaleString() + suffix; },
    });
  }, [value]);

  const hasNumber = /\d/.test(value);

  return (
    <div className="kh-stat">
      <span className="kh-stat-icon">{icon}</span>
      {hasNumber ? (
        <span ref={numRef} className="kh-stat-value">0</span>
      ) : (
        <span className="kh-stat-value">{value}</span>
      )}
      <span className="kh-stat-label">{label}</span>
    </div>
  );
}

// ─── Floating glassmorphism card ──────────────────────────────────────────────
function FloatCard({ style, emoji, title, sub }: {
  style?: React.CSSProperties;
  emoji: string; title: string; sub: string;
}) {
  return (
    <div className="kh-fcard" style={style}>
      <span className="kh-fcard-icon">{emoji}</span>
      <div>
        <p className="kh-fcard-title">{title}</p>
        <p className="kh-fcard-sub">{sub}</p>
      </div>
    </div>
  );
}

// ─── Magnetic button wrapper ──────────────────────────────────────────────────
function MagBtn({ children, onClick, outline = false }: {
  children: React.ReactNode;
  onClick?: () => void;
  outline?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current; if (!el) return;
    const r  = el.getBoundingClientRect();
    gsap.to(el, {
      x: (e.clientX - r.left - r.width  / 2) * 0.26,
      y: (e.clientY - r.top  - r.height / 2) * 0.26,
      duration: 0.3, ease: "power2.out",
    });
  };
  const onLeave = () => gsap.to(wrapRef.current, { x: 0, y: 0, duration: 0.55, ease: "elastic.out(1,0.4)" });
  return (
    <div ref={wrapRef} onMouseMove={onMove} onMouseLeave={onLeave} style={{ display: "inline-block" }}>
      <Button
        variant={outline ? "outline" : "default"}
        onClick={onClick}
        className={outline ? "kh-btn-secondary" : "kh-btn-primary"}
      >
        {children}
      </Button>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  storeCount?:   number;
  productCount?: number;
}

export default function KiyuHero3D({ storeCount = 0, productCount = 0 }: Props) {
  const [, navigate]  = useLocation();
  const sectionRef    = useRef<HTMLElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const leftRef       = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Delay canvas mount so initial HTML paint isn't blocked
  useEffect(() => { const t = setTimeout(() => setReady(true), 80); return () => clearTimeout(t); }, []);

  // ── Entry animations ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!leftRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".kh-badge",  { y: -24, opacity: 0, duration: 0.55 }, 0.15)
        .from(".kh-word",   { y: 72, opacity: 0, duration: 0.7, stagger: 0.09 }, 0.35)
        .from(".kh-sub",    { y: 20, opacity: 0, duration: 0.55 }, 0.80)
        .from(".kh-cta > *",{ y: 20, opacity: 0, duration: 0.45, stagger: 0.1 }, 0.95)
        .from(".kh-stat",   { y: 28, opacity: 0, duration: 0.45, stagger: 0.1 }, 1.10)
        .from(".kh-fcard",  { scale: 0.75, opacity: 0, duration: 0.6, stagger: 0.12, ease: "back.out(1.6)" }, 0.55);
    }, leftRef.current);
    return () => ctx.revert();
  }, []);

  // ── Scroll-exit: gem fades + shrinks as section leaves viewport ──────────
  useEffect(() => {
    if (!sectionRef.current || !canvasWrapRef.current) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current!,
        start: "top top",
        end: "bottom top",
        scrub: 0.8,
        onUpdate: (self) => {
          gsap.set(canvasWrapRef.current, {
            scale:   1 - self.progress * 0.22,
            opacity: 1 - self.progress * 0.95,
            y:       self.progress * -40,
          });
        },
      });
    });
    return () => ctx.revert();
  }, []);

  const headline = ["Discover", "Everything", "You Need"];

  const storeDisplay   = storeCount   > 0 ? `${storeCount}+`   : "50+";
  const productDisplay = productCount > 0 ? `${productCount}+` : "1,000+";

  return (
    <section ref={sectionRef} className="kh-section" aria-label="Welcome to KiyuMart">

      {/* ── Two-column grid ──────────────────────────────────────────────── */}
      <div className="kh-grid" ref={leftRef}>

        {/* LEFT — typography + CTAs */}
        <div className="kh-left">

          <span className="kh-badge">✦ &nbsp;Ghana's Multi-Vendor Marketplace</span>

          <h1 className="kh-headline" aria-label={headline.join(" ")}>
            {headline.map((word) => (
              <span key={word} className="kh-word-clip" aria-hidden="true">
                <span className="kh-word">{word}</span>
              </span>
            ))}
          </h1>

          <p className="kh-sub">
            Shop from hundreds of verified stores — groceries, fashion, electronics,
            health essentials and more. Fast delivery, straight to your door.
          </p>

          <div className="kh-cta">
            <MagBtn onClick={() => navigate("/products")}>Shop Now →</MagBtn>
            <MagBtn outline onClick={() => navigate("/stores")}>Browse Stores</MagBtn>
          </div>

          <div className="kh-stats">
            <StatCard icon="🏪" value={storeDisplay}   label="Verified Stores"  />
            <StatCard icon="📦" value={productDisplay}  label="Products"         />
            <StatCard icon="⚡" value="Same-Day"        label="Fast Delivery"    />
          </div>
        </div>

        {/* RIGHT — 3D gem canvas */}
        <div ref={canvasWrapRef} className="kh-right">
          {ready && (
            <Suspense fallback={<div className="kh-gem-placeholder" />}>
              <Canvas
                dpr={[1, 2]}
                camera={{ position: [0, 0, 6.5], fov: 48 }}
                gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
                style={{ background: "transparent", width: "100%", height: "100%" }}
                onCreated={({ gl }) => gl.setClearColor(0, 0)}
              >
                <GemScene />
              </Canvas>
            </Suspense>
          )}

          {/* Floating glass info cards */}
          <FloatCard emoji="🏆" title="Top Rated Sellers"   sub="Verified & trusted"   style={{ top: "10%",  left: "2%"  }} />
          <FloatCard emoji="🚀" title="Fast Delivery"       sub="Same-day available"   style={{ top: "52%",  right: "1%" }} />
          <FloatCard emoji="💎" title="Premium Quality"     sub="Curated selection"    style={{ bottom:"12%",left: "8%"  }} />
        </div>
      </div>

      {/* ── Wave divider → merges into HeroCarousel below ──────────────── */}
      <div className="kh-wave" aria-hidden="true">
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none">
          <path d="M0,40 C360,80 1080,0 1440,40 L1440,60 L0,60 Z" />
        </svg>
      </div>

      {/* ── Scroll cue ──────────────────────────────────────────────────── */}
      <div className="kh-scroll-cue" aria-label="Scroll to explore">
        <span className="kh-scroll-dot" />
      </div>

      {/* ── Styles ───────────────────────────────────────────────────────── */}
      <style>{`
        /* ─── Section shell ────────────────────────── */
        .kh-section {
          position: relative;
          z-index: 10;
          min-height: 94vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
          padding-bottom: 0;
        }

        /* ─── Two-column grid ──────────────────────── */
        .kh-grid {
          display: grid;
          grid-template-columns: 48fr 52fr;
          align-items: center;
          gap: 1.5rem;
          width: 100%;
          max-width: 1320px;
          margin: 0 auto;
          padding: 5rem 2.5rem 3rem;
        }

        /* ─── LEFT column ──────────────────────────── */
        .kh-left {
          display: flex;
          flex-direction: column;
          gap: 1.6rem;
        }

        .kh-badge {
          display: inline-flex;
          align-items: center;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.10em;
          text-transform: uppercase;
          padding: 0.38rem 1rem;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(255,215,100,0.15), rgba(180,120,255,0.15));
          border: 1px solid rgba(255,210,80,0.32);
          color: #b8860b;
          width: fit-content;
          backdrop-filter: blur(10px);
        }
        .dark .kh-badge {
          border-color: rgba(255,210,80,0.22);
          color: #f0c040;
        }

        .kh-headline {
          font-size: clamp(2.8rem, 5.8vw, 5rem);
          font-weight: 900;
          line-height: 1.03;
          letter-spacing: -0.04em;
          margin: 0;
        }
        .kh-word-clip {
          display: block;
          overflow: hidden;
          line-height: 1.1;
        }
        .kh-word {
          display: block;
          background: linear-gradient(130deg, #1e293b 0%, #2563eb 55%, #7c3aed 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .dark .kh-word {
          background: linear-gradient(130deg, #f1f5f9 0%, #818cf8 55%, #c084fc 100%);
          -webkit-background-clip: text;
          background-clip: text;
        }

        .kh-sub {
          font-size: 1.08rem;
          line-height: 1.72;
          color: #475569;
          max-width: 460px;
          margin: 0;
        }
        .dark .kh-sub { color: #94a3b8; }

        /* ─── CTAs ─────────────────────────────────── */
        .kh-cta {
          display: flex;
          gap: 0.85rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .kh-btn-primary {
          background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%) !important;
          border: none !important;
          color: white !important;
          font-weight: 700;
          font-size: 0.96rem;
          padding: 0.7rem 1.8rem !important;
          border-radius: 0.7rem !important;
          box-shadow: 0 4px 22px rgba(124,58,237,0.38);
          transition: box-shadow 0.2s, transform 0.2s;
          letter-spacing: 0.01em;
        }
        .kh-btn-primary:hover {
          box-shadow: 0 6px 32px rgba(124,58,237,0.55);
          transform: translateY(-1px);
        }
        .kh-btn-secondary {
          border: 1.5px solid rgba(99,102,241,0.42) !important;
          color: #4338ca !important;
          background: rgba(99,102,241,0.07) !important;
          font-weight: 700;
          font-size: 0.96rem;
          padding: 0.7rem 1.8rem !important;
          border-radius: 0.7rem !important;
          backdrop-filter: blur(10px);
          transition: background 0.2s, border-color 0.2s;
        }
        .kh-btn-secondary:hover {
          background: rgba(99,102,241,0.13) !important;
          border-color: rgba(99,102,241,0.65) !important;
        }
        .dark .kh-btn-secondary {
          border-color: rgba(165,180,252,0.30) !important;
          color: #a5b4fc !important;
          background: rgba(99,102,241,0.08) !important;
        }

        /* ─── Stats row ────────────────────────────── */
        .kh-stats {
          display: flex;
          gap: 2.4rem;
          flex-wrap: wrap;
          padding-top: 0.4rem;
        }
        .kh-stat {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .kh-stat-icon { font-size: 1.1rem; }
        .kh-stat-value {
          font-size: 1.4rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: #0f172a;
          line-height: 1.1;
        }
        .dark .kh-stat-value { color: #f1f5f9; }
        .kh-stat-label {
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: #64748b;
          font-weight: 600;
        }
        .dark .kh-stat-label { color: #94a3b8; }

        /* ─── RIGHT column — canvas wrapper ────────── */
        .kh-right {
          position: relative;
          height: clamp(360px, 52vw, 560px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kh-gem-placeholder {
          width: 100%;
          height: 100%;
          background: radial-gradient(ellipse at 50% 50%,
            rgba(99,102,241,0.14) 0%, transparent 70%);
          border-radius: 50%;
        }

        /* ─── Floating glass cards ──────────────────── */
        .kh-fcard {
          position: absolute;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.65rem 1rem;
          border-radius: 14px;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          background: rgba(255,255,255,0.74);
          border: 1px solid rgba(255,255,255,0.65);
          box-shadow: 0 8px 30px rgba(0,0,0,0.09),
                      0 1px 0   rgba(255,255,255,0.55) inset;
          pointer-events: none;
          white-space: nowrap;
          z-index: 2;
        }
        .dark .kh-fcard {
          background: rgba(10,15,35,0.68);
          border: 1px solid rgba(255,255,255,0.09);
          box-shadow: 0 8px 30px rgba(0,0,0,0.45);
        }
        .kh-fcard-icon { font-size: 1.35rem; }
        .kh-fcard-title {
          font-size: 0.80rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .dark .kh-fcard-title { color: #e2e8f0; }
        .kh-fcard-sub {
          font-size: 0.66rem;
          color: #64748b;
          margin: 0;
        }
        .dark .kh-fcard-sub { color: #94a3b8; }

        /* ─── Wave bottom divider ───────────────────── */
        .kh-wave {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          line-height: 0;
          pointer-events: none;
        }
        .kh-wave svg {
          width: 100%;
          height: 48px;
        }
        .kh-wave path {
          fill: rgba(248,250,252,0.55);
        }
        .dark .kh-wave path {
          fill: rgba(2,3,5,0.55);
        }

        /* ─── Scroll cue ────────────────────────────── */
        .kh-scroll-cue {
          position: absolute;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.5;
          animation: kh-cue-bounce 2.2s ease-in-out infinite;
        }
        .kh-scroll-dot {
          display: block;
          width: 22px;
          height: 36px;
          border-radius: 11px;
          border: 2px solid currentColor;
          position: relative;
        }
        .kh-scroll-dot::after {
          content: "";
          position: absolute;
          top: 5px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 8px;
          border-radius: 2px;
          background: currentColor;
          animation: kh-dot-scroll 2.2s ease-in-out infinite;
        }
        @keyframes kh-cue-bounce {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50%       { transform: translateX(-50%) translateY(6px); }
        }
        @keyframes kh-dot-scroll {
          0%, 100% { top: 5px; opacity: 1; }
          50%       { top: 14px; opacity: 0; }
        }

        /* ─── Responsive ─────────────────────────────── */
        @media (max-width: 900px) {
          .kh-grid {
            grid-template-columns: 1fr;
            padding: 5.5rem 1.5rem 3rem;
            text-align: center;
          }
          .kh-left { align-items: center; }
          .kh-sub  { text-align: center; }
          .kh-stats { justify-content: center; }
          .kh-right {
            height: clamp(280px, 70vw, 400px);
            order: -1;
          }
          .kh-fcard { display: none; }
          .kh-scroll-cue { display: none; }
        }
      `}</style>
    </section>
  );
}
