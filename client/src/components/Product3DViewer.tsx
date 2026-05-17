/**
 * Product3DViewer — 360° rotation + AR placement in the buyer's room.
 *
 * Powered by Google's <model-viewer> web component:
 *   - 3D mode: full mouse / touch rotation, pinch-zoom, auto-rotate
 *   - AR on Android: Scene Viewer (Chrome) / WebXR
 *   - AR on iOS:     AR Quick Look (Safari) via .usdz
 *
 * If the product has no 3D model, this component falls back to a draggable
 * 360° image carousel using the product's `images[]` (works best with 8+
 * angle shots; degrades gracefully with fewer).
 */
import { useEffect, useRef, useState } from "react";
import { Box, Smartphone, X } from "lucide-react";
import { enhanceCloudinaryUrl } from "@/lib/imageEnhance";

// Lazy-import the web component so it only ships when actually rendered.
let mvLoaded = false;
async function ensureModelViewerLoaded() {
  if (mvLoaded) return;
  await import("@google/model-viewer");
  mvLoaded = true;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": any;
    }
  }
}

export interface Product3DViewerProps {
  modelUrl?: string | null;       // .glb / .gltf
  modelUrlIos?: string | null;    // .usdz for iOS AR Quick Look
  modelPoster?: string | null;
  productName?: string;
  productImages?: string[];       // fallback for 360° image rotation
  className?: string;
  /** When true, render only the launcher buttons; viewer opens in a modal. */
  asLauncher?: boolean;
}

function has3DModel(p: Product3DViewerProps): boolean {
  return Boolean((p.modelUrl && p.modelUrl.trim()) || (p.modelUrlIos && p.modelUrlIos.trim()));
}

function has360Images(p: Product3DViewerProps): boolean {
  return Array.isArray(p.productImages) && p.productImages.filter(Boolean).length >= 4;
}

/**
 * Single-image fallback: even with just one product photo we can still offer
 * a pseudo-3D tilt effect, so EVERY product can be "rotated" in some form.
 */
function hasSingleImage(p: Product3DViewerProps): boolean {
  return Array.isArray(p.productImages) && p.productImages.filter(Boolean).length >= 1;
}

export function canShow3DViewer(p: Product3DViewerProps): boolean {
  return has3DModel(p) || has360Images(p) || hasSingleImage(p);
}

/**
 * Photo-based AR placement — opens the device rear camera and overlays the
 * product image as a draggable / pinchable layer. Free, works on any phone
 * with a camera and getUserMedia(), no .glb required.
 *
 * It is NOT plane-detecting WebXR — that needs a 3D mesh. But for casual
 * "how will this look in my room?" preview, this is what mass-market apps
 * use (think: Shein's "View in Room").
 */
function PhotoARView({ image, productName, onClose }: { image: string; productName?: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [scale, setScale] = useState(0.45);
  const dragRef = useRef<{ active: boolean; offsetX: number; offsetY: number }>({ active: false, offsetX: 0, offsetY: 0 });
  const pinchRef = useRef<{ active: boolean; startDist: number; startScale: number }>({ active: false, startDist: 0, startScale: 0 });

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Your browser doesn't support camera access.");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e: any) {
        setError(e?.message || "Camera access was denied. Please allow camera and try again.");
      }
    })();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const getPoint = (e: React.PointerEvent | PointerEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = getPoint(e);
    dragRef.current = { active: true, offsetX: p.x - pos.x, offsetY: p.y - pos.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const p = getPoint(e);
    setPos({
      x: Math.max(0.05, Math.min(0.95, p.x - dragRef.current.offsetX)),
      y: Math.max(0.05, Math.min(0.95, p.y - dragRef.current.offsetY)),
    });
  };
  const handlePointerUp = () => { dragRef.current.active = false; };

  // Pinch-to-zoom (two-finger)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { active: true, startDist: Math.hypot(dx, dy), startScale: scale };
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDist = Math.hypot(dx, dy);
      const next = Math.max(0.15, Math.min(0.95, pinchRef.current.startScale * (newDist / pinchRef.current.startDist)));
      setScale(next);
    }
  };
  const handleTouchEnd = () => { pinchRef.current.active = false; };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#000", zIndex: 10000 }}
      data-testid="photo-ar-view"
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      {error ? (
        <div style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", color: "white", padding: 24, textAlign: "center",
        }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>{error}</p>
          <button
            onClick={onClose}
            style={{ marginTop: 16, padding: "10px 18px", background: "white", color: "#111", border: "none", borderRadius: 999, fontWeight: 700, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ position: "absolute", inset: 0, touchAction: "none" }}
        >
          <img
            src={enhanceCloudinaryUrl(image, { maxWidth: 1600 })}
            alt={productName || "Product"}
            draggable={false}
            style={{
              position: "absolute",
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: `${scale * 100}%`,
              height: "auto",
              maxHeight: "70vh",
              objectFit: "contain",
              filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.55))",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        </div>
      )}

      {/* Top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, padding: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
      }}>
        <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>
          {productName ? `${productName} · in your room` : "AR preview"}
        </span>
        <button
          onClick={onClose}
          aria-label="Close AR view"
          style={{ width: 36, height: 36, borderRadius: 18, background: "rgba(255,255,255,0.18)", border: "none", color: "white", cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Bottom hint */}
      {!error && (
        <div style={{
          position: "absolute", bottom: 24, left: 0, right: 0,
          textAlign: "center", color: "rgba(255,255,255,0.85)",
          fontSize: 12, fontWeight: 600, pointerEvents: "none",
        }}>
          Drag to move · Pinch to resize
        </div>
      )}
    </div>
  );
}

/**
 * Single-image pseudo-3D tilt — drag/move the cursor and the image tilts
 * with a perspective transform. CSS-only, zero AI cost, runs everywhere.
 * Good fallback so EVERY product has some form of 3D rotation.
 */
function PseudoTilt3D({ image, productName }: { image: string; productName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const handleMove = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    // Clamp tilt to ±20°
    setTilt({ rx: (0.5 - y) * 40, ry: (x - 0.5) * 40 });
  };
  const reset = () => setTilt({ rx: 0, ry: 0 });

  return (
    <div
      ref={ref}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseLeave={reset}
      onTouchMove={(e) => {
        if (e.touches[0]) handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }}
      onTouchEnd={reset}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        position: "relative",
        background:
          "radial-gradient(circle at 50% 60%, rgba(255,255,255,0.06), rgba(0,0,0,0.55) 70%), #0a0a0a",
        borderRadius: 12,
        perspective: "1200px",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        cursor: "grab",
      }}
      aria-label="Drag or move to rotate"
      data-testid="pseudo-tilt-3d"
    >
      <img
        src={enhanceCloudinaryUrl(image, { maxWidth: 1600 })}
        alt={productName || "Product"}
        draggable={false}
        style={{
          position: "absolute",
          inset: "8%",
          width: "84%",
          height: "84%",
          objectFit: "contain",
          transformStyle: "preserve-3d",
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: "transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.55))",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 999,
          pointerEvents: "none",
        }}
      >
        ↔ Move to rotate
      </div>
    </div>
  );
}

/** 360° image swipe carousel — used when no .glb model is available. */
function Image360Carousel({ images, productName }: { images: string[]; productName?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(0);
  const dragStateRef = useRef({ x: 0, frame: 0, active: false });

  const total = images.length;

  const handleStart = (clientX: number) => {
    dragStateRef.current = { x: clientX, frame, active: true };
  };
  const handleMove = (clientX: number) => {
    const d = dragStateRef.current;
    if (!d.active) return;
    const w = containerRef.current?.clientWidth || 320;
    const delta = clientX - d.x;
    // 360° drag distance covers two full rotations of frames
    const next = (d.frame + Math.round((-delta / w) * total)) % total;
    setFrame(((next % total) + total) % total);
  };
  const handleEnd = () => {
    dragStateRef.current.active = false;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        position: "relative",
        background: "#0a0a0a",
        borderRadius: 12,
        overflow: "hidden",
        touchAction: "pan-y",
        cursor: "grab",
        userSelect: "none",
      }}
      aria-label="Drag to rotate"
      data-testid="image-360-carousel"
    >
      {images.map((src, i) => (
        <img
          key={i}
          src={enhanceCloudinaryUrl(src, { maxWidth: 1600 })}
          alt={`${productName ?? "Product"} angle ${i + 1}`}
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: i === frame ? 1 : 0,
            transition: "opacity 80ms linear",
            pointerEvents: "none",
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 999,
          pointerEvents: "none",
        }}
      >
        ↔ Drag to rotate · {frame + 1}/{total}
      </div>
    </div>
  );
}

/** Wraps model-viewer with sensible defaults for product AR. */
function ModelViewerCanvas(props: Product3DViewerProps) {
  const [ready, setReady] = useState(mvLoaded);
  useEffect(() => {
    let cancelled = false;
    ensureModelViewerLoaded().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: "#0a0a0a",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.6)",
          fontSize: 13,
        }}
        data-testid="model-viewer-loading"
      >
        Loading 3D model…
      </div>
    );
  }

  return (
    <model-viewer
      src={props.modelUrl || undefined}
      ios-src={props.modelUrlIos || undefined}
      alt={`${props.productName || "Product"} 3D model`}
      poster={props.modelPoster || (props.productImages?.[0] || undefined)}
      ar
      ar-modes="webxr scene-viewer quick-look"
      ar-scale="auto"
      camera-controls
      auto-rotate
      auto-rotate-delay="2000"
      shadow-intensity="1"
      exposure="1"
      environment-image="neutral"
      touch-action="pan-y"
      data-testid="model-viewer"
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        borderRadius: 12,
        background: "linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)",
      }}
    >
      <button
        slot="ar-button"
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          background: "white",
          color: "#111",
          border: "none",
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Smartphone className="h-4 w-4" />
        View in your room
      </button>
    </model-viewer>
  );
}

export default function Product3DViewer(props: Product3DViewerProps) {
  const [open, setOpen] = useState(!props.asLauncher);
  const [arOpen, setArOpen] = useState(false);

  if (!canShow3DViewer(props)) return null;

  // Camera-based AR for photo-only products (no .glb). On products with a .glb
  // the model-viewer slot handles AR natively.
  const canPhotoAR =
    !has3DModel(props) &&
    (props.productImages?.filter(Boolean).length ?? 0) >= 1 &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  if (props.asLauncher && !open) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="button-view-3d"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(0,0,0,0.06)",
            color: "#111",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Box className="h-4 w-4" />
          {has3DModel(props)
            ? "View in 3D"
            : (props.productImages?.filter(Boolean).length ?? 0) >= 4
              ? "360° View"
              : "3D Rotate"}
        </button>
        {canPhotoAR && (
          <button
            type="button"
            onClick={() => setArOpen(true)}
            data-testid="button-view-ar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "linear-gradient(135deg,#009688,#00BFA5)",
              color: "white",
              border: "none",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,150,136,0.35)",
            }}
          >
            <Smartphone className="h-4 w-4" />
            View in your room
          </button>
        )}
        {arOpen && canPhotoAR && (
          <PhotoARView
            image={(props.productImages || []).filter(Boolean)[0]!}
            productName={props.productName}
            onClose={() => setArOpen(false)}
          />
        )}
      </div>
    );
  }

  const filteredImages = (props.productImages || []).filter(Boolean);
  const viewer = has3DModel(props) ? (
    <ModelViewerCanvas {...props} />
  ) : filteredImages.length >= 4 ? (
    <Image360Carousel images={filteredImages} productName={props.productName} />
  ) : filteredImages.length >= 1 ? (
    <PseudoTilt3D image={filteredImages[0]} productName={props.productName} />
  ) : null;
  if (!viewer) return null;

  if (props.asLauncher) {
    // Modal overlay
    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.85)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        data-testid="3d-viewer-modal"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 720, position: "relative" }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close 3D viewer"
            style={{
              position: "absolute",
              top: -40,
              right: 0,
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <X className="h-5 w-5" /> Close
          </button>
          {viewer}
          <p
            style={{
              marginTop: 12,
              textAlign: "center",
              color: "rgba(255,255,255,0.7)",
              fontSize: 12,
            }}
          >
            {has3DModel(props)
              ? "Drag to rotate · Pinch to zoom · Tap “View in your room” for AR"
              : "Drag horizontally to rotate the product"}
          </p>
        </div>
      </div>
    );
  }

  return <div className={props.className}>{viewer}</div>;
}
