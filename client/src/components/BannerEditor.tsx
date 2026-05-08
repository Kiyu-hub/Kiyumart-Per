import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Rocket, Library, Move, X as XIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElementPos { x: number; y: number }

export interface BannerConfig {
  background: { type: "gradient" | "solid" | "image"; value: string };
  title: { text: string; color: string; size: "xl" | "2xl" | "3xl" | "4xl" };
  subtitle: { text: string; color: string };
  cta: { text: string; bgColor: string; textColor: string };
  overlay: { imageUrl: string; position: string; size: number; opacity: number } | null;
  layout: "left" | "center" | "right";
  showSponsored: boolean;
  positions?: {
    sponsored?: ElementPos;
    title?: ElementPos;
    subtitle?: ElementPos;
    cta?: ElementPos;
  } | null;
}

export const TITLE_SIZE_MAP: Record<string, string> = {
  xl: "1.5rem",
  "2xl": "1.875rem",
  "3xl": "2.25rem",
  "4xl": "3rem",
};

type PosKey = "sponsored" | "title" | "subtitle" | "cta";
type PositionsMap = NonNullable<NonNullable<BannerConfig["positions"]>>;

// ─── Constants ────────────────────────────────────────────────────────────────

export const LAYOUT_DEFAULTS: Record<"left" | "center" | "right", Record<PosKey, ElementPos>> = {
  left: {
    sponsored: { x: 8, y: 25 },
    title:     { x: 8, y: 33 },
    subtitle:  { x: 8, y: 55 },
    cta:       { x: 8, y: 72 },
  },
  center: {
    sponsored: { x: 37, y: 25 },
    title:     { x: 22, y: 33 },
    subtitle:  { x: 18, y: 55 },
    cta:       { x: 37, y: 72 },
  },
  right: {
    sponsored: { x: 62, y: 25 },
    title:     { x: 62, y: 33 },
    subtitle:  { x: 62, y: 55 },
    cta:       { x: 62, y: 72 },
  },
};

const GRADIENT_PRESETS = [
  { label: "Emerald Rush", value: "linear-gradient(135deg, #059669, #10b981, #34d399)" },
  { label: "Ocean Blue", value: "linear-gradient(135deg, #1e40af, #3b82f6, #60a5fa)" },
  { label: "Sunset", value: "linear-gradient(135deg, #dc2626, #f97316, #fbbf24)" },
  { label: "Purple Haze", value: "linear-gradient(135deg, #6d28d9, #8b5cf6, #a78bfa)" },
  { label: "Rose Gold", value: "linear-gradient(135deg, #9f1239, #e11d48, #fb7185)" },
  { label: "Midnight", value: "linear-gradient(135deg, #0f172a, #1e293b, #334155)" },
  { label: "Forest Deep", value: "linear-gradient(135deg, #14532d, #166534, #15803d)" },
  { label: "Golden Hour", value: "linear-gradient(135deg, #78350f, #d97706, #fbbf24)" },
  { label: "Cosmic", value: "linear-gradient(135deg, #1e1b4b, #4c1d95, #7c3aed)" },
  { label: "Candy", value: "linear-gradient(135deg, #db2777, #ec4899, #f472b6)" },
  { label: "Sky High", value: "linear-gradient(135deg, #0369a1, #0ea5e9, #38bdf8)" },
  { label: "Neon Lime", value: "linear-gradient(135deg, #365314, #65a30d, #a3e635)" },
  { label: "Flamingo", value: "linear-gradient(135deg, #be185d, #f43f5e, #fb7185)" },
  { label: "Dark Teal", value: "linear-gradient(135deg, #134e4a, #0f766e, #14b8a6)" },
  { label: "Bronze", value: "linear-gradient(135deg, #78350f, #92400e, #b45309)" },
  { label: "Aurora", value: "linear-gradient(135deg, #0d9488, #06b6d4, #8b5cf6)" },
  { label: "Crimson", value: "linear-gradient(135deg, #7f1d1d, #dc2626, #ef4444)" },
  { label: "Indigo Wave", value: "linear-gradient(135deg, #312e81, #4338ca, #6366f1)" },
  { label: "Tropical", value: "linear-gradient(135deg, #166534, #0891b2, #0ea5e9)" },
  { label: "Mocha", value: "linear-gradient(135deg, #44403c, #78716c, #a8a29e)" },
  { label: "Electric", value: "linear-gradient(135deg, #1d4ed8, #7c3aed, #db2777)" },
];

const SOLID_PRESETS = [
  { label: "Platform Green", value: "#16a34a" },
  { label: "Deep Navy", value: "#1e3a5f" },
  { label: "Charcoal", value: "#1c1c1e" },
  { label: "Wine Red", value: "#7f1d1d" },
  { label: "Slate", value: "#475569" },
  { label: "Royal Purple", value: "#5b21b6" },
];

const OVERLAY_POSITIONS = [
  { label: "Top Left", value: "top-left" },
  { label: "Top Center", value: "top-center" },
  { label: "Top Right", value: "top-right" },
  { label: "Middle Left", value: "middle-left" },
  { label: "Center", value: "center" },
  { label: "Middle Right", value: "middle-right" },
  { label: "Bottom Right", value: "bottom-right" },
];

const DEFAULT_CONFIG: BannerConfig = {
  background: { type: "gradient", value: GRADIENT_PRESETS[0].value },
  title: { text: "", color: "#ffffff", size: "3xl" },
  subtitle: { text: "", color: "#ffffff" },
  cta: { text: "Shop Now", bgColor: "#ffffff", textColor: "#16a34a" },
  overlay: null,
  layout: "left",
  showSponsored: true,
  positions: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOverlayStyle(position: string, size: number): CSSProperties {
  const base: CSSProperties = { position: "absolute", width: `${size}%`, zIndex: 1 };
  switch (position) {
    case "top-left":    return { ...base, top: "5%", left: "5%" };
    case "top-center":  return { ...base, top: "5%", left: "50%", transform: "translateX(-50%)" };
    case "top-right":   return { ...base, top: "5%", right: "5%" };
    case "middle-left": return { ...base, top: "50%", left: "5%", transform: "translateY(-50%)" };
    case "center":      return { ...base, top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    case "middle-right":return { ...base, top: "50%", right: "5%", transform: "translateY(-50%)" };
    case "bottom-right":return { ...base, bottom: "5%", right: "5%" };
    default:            return { ...base, top: "50%", right: "5%", transform: "translateY(-50%)" };
  }
}

function effectivePositions(config: BannerConfig): Record<PosKey, ElementPos> {
  const defaults = LAYOUT_DEFAULTS[config.layout] ?? LAYOUT_DEFAULTS.left;
  const saved = config.positions ?? {};
  return {
    sponsored: saved.sponsored ?? defaults.sponsored,
    title:     saved.title     ?? defaults.title,
    subtitle:  saved.subtitle  ?? defaults.subtitle,
    cta:       saved.cta       ?? defaults.cta,
  };
}

// ─── Media Library Picker ─────────────────────────────────────────────────────

interface MediaItem { id: string; url: string; filename: string; category: string }

function MediaLibraryPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const { data: items = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["/api/media-library", "banner-picker"],
    queryFn: () => fetch("/api/media-library", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const imageItems = items.filter((i) => !String(i.category ?? "").toLowerCase().includes("video"));

  return (
    <div className="mt-2 border rounded-xl bg-background shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Library className="h-3.5 w-3.5" /> Media Library
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : imageItems.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center p-4">No images in your media library yet.</p>
      ) : (
        <ScrollArea className="h-44">
          <div className="grid grid-cols-5 gap-1.5 p-2">
            {imageItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item.url); onClose(); }}
                className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all focus:outline-none focus:border-primary"
                title={item.filename}
              >
                <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── BannerPreview (static export — used in approval cards, etc.) ─────────────

export function BannerPreview({ config, targetName }: { config: BannerConfig; targetName: string }) {
  const bgStyle: CSSProperties =
    config.background.type === "image"
      ? { backgroundImage: `url(${config.background.value})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: config.background.value };

  const hasPositions = !!(config.positions && Object.values(config.positions).some(Boolean));

  if (hasPositions) {
    const ep = effectivePositions(config);
    return (
      <div className="relative overflow-hidden rounded-xl" style={{ height: 200, ...bgStyle }}>
        {config.overlay?.imageUrl && (
          <div style={{ ...getOverlayStyle(config.overlay.position, config.overlay.size), opacity: config.overlay.opacity / 100 }}>
            <img src={config.overlay.imageUrl} alt="" className="w-full h-auto object-contain" />
          </div>
        )}
        {config.showSponsored && (
          <div style={{ position: "absolute", left: `${ep.sponsored.x}%`, top: `${ep.sponsored.y}%`, zIndex: 2 }}>
            <p className="text-xs uppercase tracking-widest opacity-70 whitespace-nowrap" style={{ color: config.title.color }}>Sponsored</p>
          </div>
        )}
        <div style={{ position: "absolute", left: `${ep.title.x}%`, top: `${ep.title.y}%`, zIndex: 2, maxWidth: "90%" }}>
          <h3 className="font-bold leading-tight drop-shadow-lg" style={{ color: config.title.color, fontSize: TITLE_SIZE_MAP[config.title.size] }}>
            {config.title.text || targetName || "Your Promotion Title"}
          </h3>
        </div>
        {config.subtitle.text && (
          <div style={{ position: "absolute", left: `${ep.subtitle.x}%`, top: `${ep.subtitle.y}%`, zIndex: 2, maxWidth: "90%" }}>
            <p className="opacity-85 drop-shadow text-sm" style={{ color: config.subtitle.color }}>{config.subtitle.text}</p>
          </div>
        )}
        {config.cta.text && (
          <div style={{ position: "absolute", left: `${ep.cta.x}%`, top: `${ep.cta.y}%`, zIndex: 2 }}>
            <span className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold shadow-lg whitespace-nowrap" style={{ background: config.cta.bgColor, color: config.cta.textColor }}>
              {config.cta.text}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Flex-based layout (legacy / no positions set)
  const flexAlignClass =
    config.layout === "center" ? "items-center text-center" :
    config.layout === "right"  ? "items-end text-right" : "items-start text-left";

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ height: 200, ...bgStyle }}>
      {config.overlay?.imageUrl && (
        <div style={{ ...getOverlayStyle(config.overlay.position, config.overlay.size), opacity: config.overlay.opacity / 100 }}>
          <img src={config.overlay.imageUrl} alt="" className="w-full h-auto object-contain" />
        </div>
      )}
      <div className={`absolute inset-0 flex flex-col justify-center px-6 z-[2] ${flexAlignClass}`}>
        {config.showSponsored && (
          <p className="text-xs uppercase tracking-widest mb-1 opacity-70" style={{ color: config.title.color }}>Sponsored</p>
        )}
        <h3 className="font-bold leading-tight drop-shadow-lg" style={{ color: config.title.color, fontSize: TITLE_SIZE_MAP[config.title.size] }}>
          {config.title.text || targetName || "Your Promotion Title"}
        </h3>
        {config.subtitle.text && (
          <p className="mt-1.5 mb-3 opacity-85 drop-shadow text-sm" style={{ color: config.subtitle.color }}>{config.subtitle.text}</p>
        )}
        {config.cta.text && (
          <div>
            <span className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold shadow-lg" style={{ background: config.cta.bgColor, color: config.cta.textColor }}>
              {config.cta.text}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Interactive Preview (drag-to-position, used inside BannerEditor) ─────────

function InteractivePreview({
  config,
  targetName,
  onPositionsChange,
}: {
  config: BannerConfig;
  targetName: string;
  onPositionsChange: (positions: PositionsMap | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<PosKey | null>(null);
  const [selected, setSelected] = useState<PosKey | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  // Keeps the latest computed positions available during pointer events without stale closures
  const latestPosRef = useRef<Record<PosKey, ElementPos>>(effectivePositions(config));

  // Sync latestPosRef after every render so pointer handlers always see current state
  useEffect(() => {
    latestPosRef.current = effectivePositions(config);
  });

  const inDragMode = !!(config.positions);

  const bgStyle: CSSProperties =
    config.background.type === "image"
      ? { backgroundImage: `url(${config.background.value})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: config.background.value };

  const ep = effectivePositions(config);

  const handleEnableDrag = () => {
    onPositionsChange({ ...effectivePositions(config) });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, key: PosKey) => {
    if (!inDragMode) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setDragging(key);
    setSelected(key);
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(92, ((e.clientX - rect.left - dragOffsetRef.current.x) / rect.width) * 100));
    const y = Math.max(0, Math.min(92, ((e.clientY - rect.top - dragOffsetRef.current.y) / rect.height) * 100));
    const updated: Record<PosKey, ElementPos> = { ...latestPosRef.current, [dragging]: { x, y } };
    latestPosRef.current = updated;
    onPositionsChange(updated);
  };

  const handlePointerUp = () => setDragging(null);

  const elementClass = (key: PosKey) =>
    `${inDragMode ? "cursor-grab active:cursor-grabbing" : ""} ${selected === key ? "outline outline-1 outline-white/70 outline-offset-1 rounded" : ""}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>
        <div className="flex items-center gap-2">
          {inDragMode && (
            <button
              type="button"
              onClick={() => { setSelected(null); onPositionsChange(null); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <XIcon className="h-3 w-3" /> Reset positions
            </button>
          )}
          <button
            type="button"
            onClick={inDragMode ? undefined : handleEnableDrag}
            className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
              inDragMode
                ? "border-primary text-primary bg-primary/10 cursor-default"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            }`}
          >
            <Move className="h-3 w-3" />
            {inDragMode ? "Drag mode ON" : "Enable drag"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl select-none"
        style={{ height: 240, ...bgStyle, cursor: dragging ? "grabbing" : "default" }}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={() => setSelected(null)}
      >
        {/* Image overlay */}
        {config.overlay?.imageUrl && (
          <div style={{ ...getOverlayStyle(config.overlay.position, config.overlay.size), opacity: config.overlay.opacity / 100 }}>
            <img src={config.overlay.imageUrl} alt="" className="w-full h-auto object-contain" />
          </div>
        )}

        {/* Sponsored label */}
        {config.showSponsored && (
          <div
            style={{ position: "absolute", left: `${ep.sponsored.x}%`, top: `${ep.sponsored.y}%`, zIndex: 3 }}
            className={elementClass("sponsored")}
            onPointerDown={(e) => handlePointerDown(e, "sponsored")}
            onClick={(e) => { if (inDragMode) { e.stopPropagation(); setSelected("sponsored"); } }}
          >
            <p className="text-xs uppercase tracking-widest opacity-70 whitespace-nowrap" style={{ color: config.title.color }}>Sponsored</p>
          </div>
        )}

        {/* Title */}
        <div
          style={{ position: "absolute", left: `${ep.title.x}%`, top: `${ep.title.y}%`, zIndex: 3, maxWidth: "88%" }}
          className={elementClass("title")}
          onPointerDown={(e) => handlePointerDown(e, "title")}
          onClick={(e) => { if (inDragMode) { e.stopPropagation(); setSelected("title"); } }}
        >
          <h3 className="font-bold leading-tight drop-shadow-lg" style={{ color: config.title.color, fontSize: TITLE_SIZE_MAP[config.title.size] }}>
            {config.title.text || targetName || "Your Promotion Title"}
          </h3>
        </div>

        {/* Subtitle */}
        {config.subtitle.text && (
          <div
            style={{ position: "absolute", left: `${ep.subtitle.x}%`, top: `${ep.subtitle.y}%`, zIndex: 3, maxWidth: "88%" }}
            className={elementClass("subtitle")}
            onPointerDown={(e) => handlePointerDown(e, "subtitle")}
            onClick={(e) => { if (inDragMode) { e.stopPropagation(); setSelected("subtitle"); } }}
          >
            <p className="opacity-85 drop-shadow text-sm" style={{ color: config.subtitle.color }}>{config.subtitle.text}</p>
          </div>
        )}

        {/* CTA button */}
        {config.cta.text && (
          <div
            style={{ position: "absolute", left: `${ep.cta.x}%`, top: `${ep.cta.y}%`, zIndex: 3 }}
            className={elementClass("cta")}
            onPointerDown={(e) => handlePointerDown(e, "cta")}
            onClick={(e) => { if (inDragMode) { e.stopPropagation(); setSelected("cta"); } }}
          >
            <span className="inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold shadow-lg whitespace-nowrap" style={{ background: config.cta.bgColor, color: config.cta.textColor }}>
              {config.cta.text}
            </span>
          </div>
        )}

        {/* Drag hint */}
        {inDragMode && !dragging && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/55 text-white text-[10px] px-2.5 py-1 rounded-full z-10 whitespace-nowrap">
            Drag any element to reposition it
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BannerEditor ─────────────────────────────────────────────────────────────

interface BannerEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string;
  initialConfig?: BannerConfig | null;
  onSave: (config: BannerConfig) => void;
  isSaving?: boolean;
  saveLabel?: string;
}

export function BannerEditor({
  open,
  onOpenChange,
  targetName,
  initialConfig,
  onSave,
  isSaving,
  saveLabel,
}: BannerEditorProps) {
  const [config, setConfig] = useState<BannerConfig>(initialConfig || DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<"background" | "text" | "overlay" | "layout">("background");
  const [overlayLibOpen, setOverlayLibOpen] = useState(false);
  const [bgLibOpen, setBgLibOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setConfig(initialConfig || DEFAULT_CONFIG);
      setActiveTab("background");
      setOverlayLibOpen(false);
      setBgLibOpen(false);
    }
  }, [open]); // intentionally omit initialConfig to avoid resetting while open

  const update = <K extends keyof BannerConfig>(key: K, patch: Partial<BannerConfig[K] & object>) =>
    setConfig((c) => ({ ...c, [key]: { ...(c[key] as object), ...patch } }));

  const updateOverlay = (patch: Partial<NonNullable<BannerConfig["overlay"]>>) =>
    setConfig((c) => ({
      ...c,
      overlay: c.overlay
        ? { ...c.overlay, ...patch }
        : { imageUrl: "", position: "middle-right", size: 45, opacity: 100, ...patch },
    }));

  // Called from InteractivePreview — materializes or clears element positions
  const handlePositionsChange = (positions: PositionsMap | null) =>
    setConfig((c) => ({ ...c, positions: positions ?? null }));

  // Fine-tune slider in the Layout tab: materialises all positions on first use
  const updateElementPos = (key: PosKey, axis: "x" | "y", val: number) => {
    setConfig((c) => {
      const base = effectivePositions(c);
      return { ...c, positions: { ...base, [key]: { ...base[key], [axis]: val } } };
    });
  };

  const tabs = ["background", "text", "overlay", "layout"] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Banner Designer
          </DialogTitle>
          <DialogDescription>
            Customize how this promotion banner appears on the homepage hero carousel.
          </DialogDescription>
        </DialogHeader>

        {/* Interactive live preview with drag support */}
        <InteractivePreview
          config={config}
          targetName={targetName}
          onPositionsChange={handlePositionsChange}
        />

        {/* Tab navigation */}
        <div className="flex border-b mt-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "overlay" ? "Image Overlay" : tab === "layout" ? "Layout & Position" : tab}
            </button>
          ))}
        </div>

        {/* ── Background ── */}
        {activeTab === "background" && (
          <div className="space-y-5 py-2">
            <div>
              <p className="text-sm font-semibold mb-2">Gradient Presets</p>
              <div className="grid grid-cols-7 gap-2">
                {GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    title={preset.label}
                    onClick={() => setConfig((c) => ({ ...c, background: { type: "gradient", value: preset.value } }))}
                    className={`h-10 rounded-lg transition-all hover:scale-105 ${
                      config.background.value === preset.value ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                    style={{ background: preset.value }}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Solid Colors</p>
              <div className="flex gap-3 flex-wrap">
                {SOLID_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    title={preset.label}
                    onClick={() => setConfig((c) => ({ ...c, background: { type: "solid", value: preset.value } }))}
                    className={`h-10 w-10 rounded-full border-2 border-background transition-all hover:scale-110 ${
                      config.background.value === preset.value ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                    style={{ background: preset.value }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Image background / Custom value</label>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={config.background.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    const type = v.startsWith("http") ? "image" : v.startsWith("linear") || v.startsWith("radial") ? "gradient" : "solid";
                    setConfig((c) => ({ ...c, background: { type, value: v } }));
                  }}
                  placeholder="linear-gradient(…) or #hex or https://image-url"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setBgLibOpen((v) => !v)}
                  className="shrink-0"
                >
                  <Library className="h-3.5 w-3.5 mr-1.5" /> Library
                </Button>
              </div>
              {bgLibOpen && (
                <MediaLibraryPicker
                  onSelect={(url) => setConfig((c) => ({ ...c, background: { type: "image", value: url } }))}
                  onClose={() => setBgLibOpen(false)}
                />
              )}
              <p className="text-xs text-muted-foreground">Paste a CSS gradient, hex color, or image URL — or pick from your media library above</p>
            </div>
          </div>
        )}

        {/* ── Text ── */}
        {activeTab === "text" && (
          <div className="space-y-4 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title text</label>
                <Input
                  value={config.title.text}
                  onChange={(e) => update("title", { text: e.target.value })}
                  placeholder={targetName || "Your promotion title…"}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title size</label>
                <Select value={config.title.size} onValueChange={(v) => update("title", { size: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xl">Small (1.5 rem)</SelectItem>
                    <SelectItem value="2xl">Medium (1.875 rem)</SelectItem>
                    <SelectItem value="3xl">Large (2.25 rem)</SelectItem>
                    <SelectItem value="4xl">Extra Large (3 rem)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.title.color} onChange={(e) => update("title", { color: e.target.value })} className="h-9 w-9 rounded border cursor-pointer shrink-0" />
                  <Input value={config.title.color} onChange={(e) => update("title", { color: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subtitle text</label>
                <Input
                  value={config.subtitle.text}
                  onChange={(e) => update("subtitle", { text: e.target.value })}
                  placeholder="Optional tagline…"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subtitle color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.subtitle.color} onChange={(e) => update("subtitle", { color: e.target.value })} className="h-9 w-9 rounded border cursor-pointer shrink-0" />
                  <Input value={config.subtitle.color} onChange={(e) => update("subtitle", { color: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CTA button text</label>
                <Input
                  value={config.cta.text}
                  onChange={(e) => update("cta", { text: e.target.value })}
                  placeholder="Shop Now"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CTA background color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.cta.bgColor} onChange={(e) => update("cta", { bgColor: e.target.value })} className="h-9 w-9 rounded border cursor-pointer shrink-0" />
                  <Input value={config.cta.bgColor} onChange={(e) => update("cta", { bgColor: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CTA text color</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={config.cta.textColor} onChange={(e) => update("cta", { textColor: e.target.value })} className="h-9 w-9 rounded border cursor-pointer shrink-0" />
                  <Input value={config.cta.textColor} onChange={(e) => update("cta", { textColor: e.target.value })} />
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.showSponsored}
                onChange={(e) => setConfig((c) => ({ ...c, showSponsored: e.target.checked }))}
                className="h-4 w-4 rounded border"
              />
              <span className="text-sm font-medium">Show "Sponsored" label</span>
            </label>
          </div>
        )}

        {/* ── Image Overlay ── */}
        {activeTab === "overlay" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Image Overlay</p>
                <p className="text-xs text-muted-foreground">Place a product or brand image on top of the background</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    overlay: c.overlay
                      ? null
                      : { imageUrl: "", position: "middle-right", size: 45, opacity: 100 },
                  }))
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.overlay ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.overlay ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {config.overlay !== null && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Image URL</label>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={config.overlay.imageUrl}
                      onChange={(e) => updateOverlay({ imageUrl: e.target.value })}
                      placeholder="https://your-image-url.com/image.png"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => setOverlayLibOpen((v) => !v)}
                      className="shrink-0"
                    >
                      <Library className="h-3.5 w-3.5 mr-1.5" /> Library
                    </Button>
                  </div>
                  {overlayLibOpen && (
                    <MediaLibraryPicker
                      onSelect={(url) => updateOverlay({ imageUrl: url })}
                      onClose={() => setOverlayLibOpen(false)}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">Use a transparent PNG for best results — or pick from your media library above</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Position</label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {OVERLAY_POSITIONS.map((pos) => (
                      <button
                        key={pos.value}
                        type="button"
                        onClick={() => updateOverlay({ position: pos.value })}
                        className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                          config.overlay?.position === pos.value
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Size — {config.overlay.size}%</label>
                  <input type="range" min={15} max={80} step={1} value={config.overlay.size} onChange={(e) => updateOverlay({ size: Number(e.target.value) })} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Opacity — {config.overlay.opacity}%</label>
                  <input type="range" min={10} max={100} step={1} value={config.overlay.opacity} onChange={(e) => updateOverlay({ opacity: Number(e.target.value) })} className="w-full" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Layout & Position ── */}
        {activeTab === "layout" && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Quick layout</label>
              <div className="flex gap-3">
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, layout: align }))}
                    className={`flex-1 rounded-xl border py-3 text-sm font-medium capitalize transition-colors ${
                      config.layout === align
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {align}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Sets the default starting position. To freely move each element, click <strong>Enable drag</strong> in the preview above — then drag any element, or use the sliders below.
              </p>
            </div>

            {/* Per-element fine-tune sliders — visible once drag mode is enabled */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                Fine-tune positions
                {!config.positions && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">(enable drag in preview to unlock)</span>
                )}
              </p>
              {(["sponsored", "title", "subtitle", "cta"] as PosKey[]).map((key) => {
                const labels: Record<PosKey, string> = {
                  sponsored: "Sponsored label",
                  title: "Title / Name",
                  subtitle: "Subtitle",
                  cta: "Shop button",
                };
                const pos = effectivePositions(config)[key];
                return (
                  <div
                    key={key}
                    className={`rounded-xl border p-3 space-y-2 transition-opacity ${config.positions ? "" : "opacity-40 pointer-events-none"}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels[key]}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Left — {Math.round(pos.x)}%</label>
                        <input
                          type="range" min={0} max={92} step={1}
                          value={Math.round(pos.x)}
                          onChange={(e) => updateElementPos(key, "x", Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Top — {Math.round(pos.y)}%</label>
                        <input
                          type="range" min={0} max={92} step={1}
                          value={Math.round(pos.y)}
                          onChange={(e) => updateElementPos(key, "y", Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => onSave(config)} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            {saveLabel ?? "Save & Activate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
