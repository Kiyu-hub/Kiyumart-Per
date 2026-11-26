/**
 * Phone-only "Add product" flow (owner-approved design, 26 Nov 2026).
 *
 *   Step 1 · Product info        name, category, description, the store type's
 *                                 product details, delivery time
 *   Step 2 · Prices, colours &   price, "was price" (shown crossed out),
 *            stock               sizes × colours stock grid (total is automatic)
 *                                 or one quantity for single items
 *   Step 3 · adapts to product   clothing → measuring picture + numbers per size
 *                                 shoes → EU/UK/US + foot length chart
 *                                 beauty → size/volume and product facts
 *                                 jewellery/belts/fabric → nothing to measure
 *
 * Saves through the same endpoints as the desktop form: POST /api/products,
 * then one POST /api/products/:id/variants per colour + size with stock.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  getStoreTypeProductFields,
  buildStoreTypeProductDefaults,
  type DynamicField,
  type StoreType,
} from "@shared/storeTypes";
import {
  MEASUREMENT_GUIDES,
  BODY_GUIDES,
  GARMENT_GUIDE_CHOICES,
  SHOE_SIZE_TABLE,
  measurementPicture,
  suggestMeasureMode,
  toLegacySizeGuide,
  type MeasurementGuideData,
  type MeasurementGuideId,
  type BodyGuideId,
} from "@/lib/measurementGuides";

interface Props {
  open: boolean;
  onClose: () => void;
  store: { id: string; storeType?: string | null } | null | undefined;
  userId: string;
}

interface ColourEntry { id: string; name: string; images: string[] }

const DELIVERY_OPTIONS = ["Same day", "Next day", "1-2 days", "2-3 days", "3-5 business days", "5-7 business days", "1-2 weeks"];
const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "Free size"];
const SHOE_SIZES = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];
const SWATCHES: Record<string, string> = {
  black: "#121212", white: "#f8f8f6", red: "#c62828", blue: "#1e56c4", navy: "#1f2f5c", green: "#2e7d32",
  yellow: "#f2c200", orange: "#ef6c00", pink: "#ec5f95", purple: "#7b3fa0", brown: "#7a4e33", beige: "#d8c3a5",
  cream: "#f2ead8", grey: "#8a8a8a", gray: "#8a8a8a", gold: "#c9a227", silver: "#b9bec5", maroon: "#6d1b1b", wine: "#6d1b2e", nude: "#d6a77a",
};
const swatchFor = (name: string) => SWATCHES[name.trim().toLowerCase().split(/\s+/).pop() || ""] || "#c9c5be";
const HIDDEN_FIELD_NAMES = new Set(["sku", "barcode"]);
const isPrice = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim());
const uid = () => Math.random().toString(36).slice(2, 10);

async function sendJson<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!res.ok) {
    let msg = parsed?.error || parsed?.message || text || `Request failed (${res.status})`;
    if (typeof msg === "string" && msg.trim().startsWith("[")) {
      try { msg = JSON.parse(msg).map((e: any) => e.message).join(". "); } catch { /* keep raw */ }
    }
    throw new Error(String(msg));
  }
  return parsed as T;
}

async function uploadImage(file: File): Promise<string> {
  for (const [endpoint, withCreds] of [["/api/upload/image", true], ["/api/upload/public", false]] as const) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd, credentials: withCreds ? "include" : "omit" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) return String(json.url);
    } catch { /* try next */ }
  }
  throw new Error("Photo upload failed. Check your connection and try again.");
}

/* ── Small building blocks (Tailwind tokens so light/dark both work) ───── */
const chipCls = (on: boolean) =>
  `h-10 rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground"}`;
const inputCls = "h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[15px] text-foreground outline-none focus:border-primary";
const labelCls = "text-[13px] font-semibold text-foreground";

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/40"}`}>
      <span className={`absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}

function DynamicInput({ field, value, onChange }: { field: DynamicField; value: any; onChange: (v: any) => void }) {
  const id = `wiz-${field.name}`;
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "select" && Array.isArray(field.options)) {
    return (
      <div className="flex flex-col gap-2">
        <span className={labelCls}>{label}</span>
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => (
            <button key={opt} type="button" className={chipCls(value === opt)} aria-pressed={value === opt} onClick={() => onChange(value === opt ? "" : opt)}>{opt}</button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "multiselect" && Array.isArray(field.options)) {
    const list: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-2">
        <span className={labelCls}>{label}</span>
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => {
            const on = list.includes(opt);
            return (
              <button key={opt} type="button" aria-pressed={on}
                className={`h-9 rounded-full px-3 text-[13px] font-semibold ${on ? "bg-primary/15 text-primary" : "border border-border bg-background text-foreground"}`}
                onClick={() => onChange(on ? list.filter((x) => x !== opt) : [...list, opt])}>{on ? `✓ ${opt}` : opt}</button>
            );
          })}
        </div>
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <Field label={label} htmlFor={id}>
        <textarea id={id} rows={2} value={value || ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)}
          className="min-w-0 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-primary" />
      </Field>
    );
  }
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} value={value || ""}
        placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </Field>
  );
}

/* ── The wizard ──────────────────────────────────────────────────────────── */
export default function MobileAddProductWizard({ open, onClose, store, userId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const storeType = (store?.storeType || "clothing") as StoreType;
  const isBeauty = storeType === "beauty_cosmetics";
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: allCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories", "active"],
    queryFn: async () => (await fetch("/api/categories?isActive=true")).json(),
    enabled: open,
  });
  const categories = useMemo(
    () => (Array.isArray(allCategories) ? allCategories : []).filter(
      (c: any) => !c.storeTypes || c.storeTypes.length === 0 || c.storeTypes.includes(storeType),
    ),
    [allCategories, storeType],
  );

  const productFields = useMemo(
    () => getStoreTypeProductFields(storeType).filter((f) => !HIDDEN_FIELD_NAMES.has(f.name)),
    [storeType],
  );

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  // Step 1
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [specific, setSpecific] = useState<Record<string, any>>({});
  const [delivery, setDelivery] = useState("2-3 days");
  // Step 2
  const [price, setPrice] = useState("");
  const [wasPrice, setWasPrice] = useState("");
  const [hasOptions, setHasOptions] = useState(true);
  const [sizes, setSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState("");
  const [colours, setColours] = useState<ColourEntry[]>([]);
  const [newColour, setNewColour] = useState("");
  const [stock, setStock] = useState<Record<string, string>>({}); // `${colourId}|${size}` → qty
  const [singlePhotos, setSinglePhotos] = useState<string[]>([]);
  const [singleQty, setSingleQty] = useState("1");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // Step 3
  const [guideOverride, setGuideOverride] = useState<MeasurementGuideId | null>(null);
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [activeSize, setActiveSize] = useState<string>("");
  const [measures, setMeasures] = useState<Record<string, Record<string, string>>>({});
  const [withBody, setWithBody] = useState(false);
  const [bodyMeasures, setBodyMeasures] = useState<Record<string, Record<string, string>>>({});
  const [shoeChart, setShoeChart] = useState<Record<string, { uk?: string; us?: string; footLength?: string; footWidth?: string }>>({});
  const [shoeFit, setShoeFit] = useState<"small" | "true" | "large">("true");
  const [error, setError] = useState<string | null>(null);

  // Reset everything when the flow is opened fresh.
  useEffect(() => {
    if (!open) return;
    setStep(1); setSaving(false); setError(null);
    setName(""); setCategoryId(""); setDescription(""); setSpecific({}); setDelivery("2-3 days");
    setPrice(""); setWasPrice(""); setHasOptions(!isBeauty); setSizes([]); setCustomSize(""); setColours([]); setNewColour("");
    setStock({}); setSinglePhotos([]); setSingleQty("1");
    setGuideOverride(null); setUnit("cm"); setActiveSize(""); setMeasures({}); setWithBody(false); setBodyMeasures({});
    setShoeChart({}); setShoeFit("true");
  }, [open, isBeauty]);

  // Lock page scroll behind the full-screen flow.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); setError(null); }, [step]);
  // Hide the error as soon as the seller changes something.
  useEffect(() => { setError(null); }, [name, categoryId, description, specific, price, wasPrice, hasOptions, sizes, colours, stock, singlePhotos, singleQty, measures, shoeChart]);

  const category = categories.find((c: any) => c.id === categoryId);
  const measureMode = useMemo(
    () => suggestMeasureMode({ storeType, categorySlug: category?.slug, categoryName: category?.name, genderTarget: specific.genderTarget }),
    [storeType, category?.slug, category?.name, specific.genderTarget],
  );
  const guideId: MeasurementGuideId | null =
    measureMode.mode === "garment" ? (guideOverride || measureMode.guide) : null;
  const guide = guideId ? MEASUREMENT_GUIDES[guideId] : null;
  const isShoes = guide?.kind === "shoes";
  const oneSizeGuide = !!guide?.oneSize;
  const bodyGuideId: BodyGuideId = /^(men|boys)$/i.test(String(specific.genderTarget || "")) ? "body-men" : "body-women";

  // Step 1 shows the store type's product details, except beauty facts (step 3).
  const step1Fields = isBeauty ? [] : productFields;
  const step3BeautyFields = isBeauty ? productFields : [];

  const sizePresets = isShoes ? SHOE_SIZES : isBeauty ? [] : CLOTHING_SIZES;
  const effectiveSizes = hasOptions ? sizes : [];
  const sizeLabels = effectiveSizes.length > 0 ? effectiveSizes : ["One size"];
  const measureSizes = oneSizeGuide ? ["One size"] : sizeLabels;
  const currentMeasureSize = measureSizes.includes(activeSize) ? activeSize : measureSizes[0];

  const qty = (colourId: string, size: string) => Math.max(0, parseInt(stock[`${colourId}|${size}`] || "0", 10) || 0);
  const stockKeys = (effectiveSizes.length > 0 ? effectiveSizes : [""]);
  const totalStock = hasOptions
    ? colours.reduce((sum, c) => sum + stockKeys.reduce((s, sz) => s + qty(c.id, sz), 0), 0)
    : Math.max(0, parseInt(singleQty || "0", 10) || 0);
  const allPhotos = hasOptions
    ? Array.from(new Set(colours.flatMap((c) => c.images)))
    : singlePhotos;

  if (!open) return null;

  /* ── handlers ── */
  const toggleSize = (s: string) => setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const addCustomSize = () => {
    const v = customSize.trim();
    if (v && !sizes.includes(v)) setSizes((p) => [...p, v]);
    setCustomSize("");
  };
  const addColour = () => {
    const v = newColour.trim();
    if (!v) return;
    if (colours.some((c) => c.name.toLowerCase() === v.toLowerCase())) { setNewColour(""); return; }
    setColours((p) => [...p, { id: uid(), name: v, images: [] }]);
    setNewColour("");
  };
  const removeColour = (id: string) => setColours((p) => p.filter((c) => c.id !== id));
  const handlePhotos = async (files: FileList | null, target: string) => {
    if (!files || files.length === 0) return;
    setUploadingFor(target);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 8)) urls.push(await uploadImage(file));
      if (target === "__single") setSinglePhotos((p) => [...p, ...urls].slice(0, 8));
      else setColours((p) => p.map((c) => (c.id === target ? { ...c, images: [...c.images, ...urls].slice(0, 8) } : c)));
    } catch (e: any) {
      toast({ title: "Photo not added", description: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploadingFor(null);
    }
  };
  const removePhoto = (target: string, url: string) => {
    if (target === "__single") setSinglePhotos((p) => p.filter((u) => u !== url));
    else setColours((p) => p.map((c) => (c.id === target ? { ...c, images: c.images.filter((u) => u !== url) } : c)));
  };
  const setMeasure = (size: string, key: string, v: string, body = false) => {
    const clean = v.replace(/[^0-9.]/g, "");
    (body ? setBodyMeasures : setMeasures)((prev) => ({ ...prev, [size]: { ...(prev[size] || {}), [key]: clean } }));
  };
  const copyFromPrevious = () => {
    const i = measureSizes.indexOf(currentMeasureSize);
    if (i <= 0) return;
    const prevSize = measureSizes[i - 1];
    setMeasures((p) => ({ ...p, [currentMeasureSize]: { ...(p[prevSize] || {}) } }));
  };
  const shoeRow = (size: string) => {
    const preset = SHOE_SIZE_TABLE[size];
    const row = shoeChart[size] || {};
    return { uk: row.uk ?? preset?.uk ?? "", us: row.us ?? "", footLength: row.footLength ?? preset?.cm ?? "", footWidth: row.footWidth ?? "" };
  };

  /* ── validation per step ── */
  const validate = (s: number): string | null => {
    if (s === 1) {
      if (name.trim().length < 2) return "Add a product name.";
      if (!categoryId) return "Choose a category.";
      if (description.trim().length < 10) return "Write a short description (at least 10 characters).";
      for (const f of step1Fields) {
        const v = specific[f.name];
        if (f.required && (v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === ""))) return `Fill in “${f.label}”.`;
      }
    }
    if (s === 2) {
      if (!isPrice(price)) return "Enter the selling price, e.g. 450 or 450.00.";
      if (wasPrice.trim() && !isPrice(wasPrice)) return "The was price must be a number, e.g. 550.";
      if (wasPrice.trim() && Number(wasPrice) <= Number(price)) return "The was price must be higher than the selling price.";
      if (hasOptions) {
        if (colours.length === 0) return isBeauty ? "Add at least one shade." : "Add at least one colour.";
        const missing = colours.find((c) => c.images.length === 0);
        if (missing) return `Add at least one photo for ${missing.name}.`;
      }
      if (allPhotos.length < 3) return `Add at least 3 photos in total (you have ${allPhotos.length}).`;
      if (totalStock <= 0) return "Enter how many you have in stock.";
    }
    if (s === 3) {
      if (isBeauty) {
        for (const f of step3BeautyFields) {
          const v = specific[f.name];
          if (f.required && (v == null || String(v).trim() === "")) return `Fill in “${f.label}”.`;
        }
      } else if (guide && isShoes) {
        const missing = sizeLabels.find((sz) => !shoeRow(sz).footLength);
        if (missing) return `Add the foot length for size ${missing}.`;
      } else if (guide) {
        for (const sz of measureSizes) {
          const row = measures[sz] || {};
          const gap = guide.fields.find((f) => !String(row[f.key] || "").trim());
          if (gap) return `Add “${gap.label}” for ${sz === "One size" ? "this item" : `size ${sz}`}.`;
        }
      }
    }
    return null;
  };
  const next = () => {
    const err = validate(step);
    if (err) { setError(err); return; }
    if (step < 3) setStep(step + 1);
    else void publish();
  };

  /* ── save ── */
  const publish = async () => {
    setSaving(true);
    setError(null);
    try {
      let measurementGuide: MeasurementGuideData | undefined;
      if (guide && guideId) {
        measurementGuide = {
          type: guideId,
          unit,
          rows: isShoes
            ? Object.fromEntries(sizeLabels.map((sz) => { const r = shoeRow(sz); return [sz, { footLength: r.footLength, footWidth: r.footWidth }]; }))
            : Object.fromEntries(measureSizes.map((sz) => [sz, measures[sz] || {}])),
          ...(withBody && !isShoes && !oneSizeGuide ? { body: { guide: bodyGuideId, rows: Object.fromEntries(measureSizes.map((sz) => [sz, bodyMeasures[sz] || {}])) } } : {}),
          ...(isShoes ? {
            shoeSizes: Object.fromEntries(sizeLabels.map((sz) => { const r = shoeRow(sz); return [sz, { uk: r.uk, us: r.us }]; })),
            shoeFit,
          } : {}),
        };
      }
      const storeSpecific = buildStoreTypeProductDefaults(storeType, specific);
      const productData: any = {
        name: name.trim(),
        description: description.trim(),
        price: Number(price).toFixed(2),
        costPrice: wasPrice.trim() ? Number(wasPrice).toFixed(2) : null,
        categoryId,
        stock: totalStock,
        images: allPhotos.slice(0, 8),
        video: null,
        deliveryDuration: delivery || null,
        sellerId: userId,
        storeId: store?.id || null,
        tags: [],
        dynamicFields: {
          storeType,
          storeSpecific,
          homepageFeatured: false,
          homepageNewArrival: false,
          variantSummary: [],
          ...(measurementGuide ? { measurementGuide, sizeGuide: isShoes ? undefined : toLegacySizeGuide(measurementGuide) } : {}),
        },
      };
      const created = await sendJson<any>("POST", "/api/products", productData);
      let variantFailures = 0;
      if (hasOptions && created?.id) {
        for (const c of colours) {
          for (const sz of stockKeys) {
            const q = qty(c.id, sz);
            if (q <= 0) continue;
            try {
              await sendJson("POST", `/api/products/${created.id}/variants`, { color: c.name, size: sz || null, images: c.images.slice(0, 8), stock: q });
            } catch { variantFailures += 1; }
          }
        }
      }
      for (const key of [["/api/products"], ["/api/products", "seller", userId], ["/api/products", "seller-dashboard", userId], ["/api/homepage/new-arrivals"], ["/api/homepage/featured-products"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      toast({
        title: variantFailures ? "Product saved, check options" : "Product published",
        description: variantFailures
          ? `${variantFailures} colour/size option(s) didn't save. Open the product to add them.`
          : `${name.trim()} is now in your store.`,
        variant: variantFailures ? "destructive" : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Couldn't save the product. Try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ── render ── */
  const stepTitle = step === 1 ? "Product info"
    : step === 2 ? (isBeauty ? "Prices, shades & stock" : "Prices, colours & stock")
    : isBeauty ? "Size & product facts" : isShoes ? "Shoe sizes" : measureMode.mode === "none" ? "Finish" : "Measurements";
  const colourWord = isBeauty ? "shade" : "colour";
  const pct = wasPrice && isPrice(wasPrice) && isPrice(price) && Number(wasPrice) > Number(price)
    ? Math.round((1 - Number(price) / Number(wasPrice)) * 100) : null;

  // Portalled to <body> so the dashboard's phone layout rules (flex-wrap,
  // padding) and any transformed ancestor can't reshape this full-screen flow.
  return createPortal(
    <div className="fixed inset-0 z-[12500] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label="Add product" data-fullscreen="">
      <header className="border-b border-border px-5 pb-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold tracking-wide text-primary">STEP {step} OF 3</div>
            <h1 className="mt-0.5 text-[19px] font-bold">{stepTitle}</h1>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((n) => <span key={n} className={`h-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`} />)}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4">
        {step === 1 && (
          <div className="flex flex-col gap-[18px]">
            <Field label="Product name *" htmlFor="wiz-name">
              <input id="wiz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black abaya with gold embroidery" className={inputCls} />
            </Field>
            <Field label="Category *" htmlFor="wiz-cat">
              <select id="wiz-cat" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setGuideOverride(null); }} className={inputCls}>
                <option value="">Choose a category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Description *" htmlFor="wiz-desc">
              <textarea id="wiz-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What makes it special? Fabric feel, details, how it's worn…"
                className="min-w-0 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-primary" />
            </Field>
            {step1Fields.map((f) => (
              <DynamicInput key={f.name} field={f} value={specific[f.name]} onChange={(v) => setSpecific((p) => ({ ...p, [f.name]: v }))} />
            ))}
            <Field label="Delivery time" htmlFor="wiz-del">
              <select id="wiz-del" value={delivery} onChange={(e) => setDelivery(e.target.value)} className={inputCls}>
                {DELIVERY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-[18px]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Selling price (GH₵) *" htmlFor="wiz-price">
                <input id="wiz-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="450.00" className={inputCls} />
              </Field>
              <Field label="Was price (GH₵)" htmlFor="wiz-was">
                <input id="wiz-was" inputMode="decimal" value={wasPrice} onChange={(e) => setWasPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Optional" className={inputCls} />
              </Field>
            </div>
            <p className="-mt-2.5 text-xs leading-relaxed text-muted-foreground">
              Optional. Shown crossed out to buyers{pct != null ? <> as <s>GH₵{Number(wasPrice).toFixed(2)}</s> <strong className="text-primary">−{pct}%</strong></> : ""}. Never enter what you paid.
            </p>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5">
              <div>
                <div className="text-sm font-semibold">Different {isBeauty ? "shades or sizes" : "colours or sizes"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{hasOptions ? "Off for a one-size, one-colour item" : `This item has one ${colourWord} and one size`}</div>
              </div>
              <Toggle on={hasOptions} onChange={setHasOptions} label={`Different ${colourWord}s or sizes`} />
            </div>

            {hasOptions ? (
              <>
                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-bold">{isShoes ? "Shoe sizes you sell (EU)" : isBeauty ? "Sizes / volumes (optional)" : "Sizes you sell"}</div>
                  <div className="flex flex-wrap gap-2">
                    {[...sizePresets, ...sizes.filter((s) => !sizePresets.includes(s))].map((s) => (
                      <button key={s} type="button" aria-pressed={sizes.includes(s)} onClick={() => toggleSize(s)} className={`min-w-[46px] ${chipCls(sizes.includes(s))}`}>{s}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input aria-label="Other size" value={customSize} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(); } }}
                      placeholder={isBeauty ? "e.g. 100ml" : isShoes ? "e.g. 47" : "Other size, e.g. 44 or Tall"} className={`${inputCls} h-10`} />
                    <button type="button" onClick={addCustomSize} className="h-10 shrink-0 rounded-full border border-dashed border-muted-foreground px-4 text-sm font-semibold text-primary">+ Add</button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-bold">{isBeauty ? "Shades & photos" : "Colours & photos"}</div>
                  <div className="flex flex-col rounded-xl border border-border">
                    {colours.map((c) => (
                      <div key={c.id} className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="h-6 w-6 shrink-0 rounded-full border border-border" style={{ background: swatchFor(c.name) }} />
                          <span className="flex-1 text-sm font-semibold">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.images.length} photo{c.images.length === 1 ? "" : "s"}</span>
                          <button type="button" aria-label={`Remove ${c.name}`} onClick={() => removeColour(c.id)} className="grid h-9 w-9 place-items-center text-muted-foreground">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {c.images.map((u) => (
                            <button key={u} type="button" aria-label="Remove photo" onClick={() => removePhoto(c.id, u)} className="relative h-14 w-11 overflow-hidden rounded-md border border-border">
                              <img src={u} alt="" className="h-full w-full object-cover" />
                              <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-[10px] text-white">×</span>
                            </button>
                          ))}
                          {c.images.length < 8 && (
                            <label className="grid h-14 w-11 cursor-pointer place-items-center rounded-md border border-dashed border-muted-foreground text-lg text-primary">
                              {uploadingFor === c.id ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : "+"}
                              <input type="file" accept="image/*" multiple className="sr-only" aria-label={`Add photos for ${c.name}`} onChange={(e) => { void handlePhotos(e.target.files, c.id); e.target.value = ""; }} />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 p-2.5">
                      <input aria-label={`New ${colourWord} name`} value={newColour} onChange={(e) => setNewColour(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColour(); } }}
                        placeholder={isBeauty ? "Shade name, e.g. Nude 02" : "Colour, e.g. Black"} className={`${inputCls} h-11`} />
                      <button type="button" onClick={addColour} className="h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">+ Add {colourWord}</button>
                    </div>
                  </div>
                </div>

                {colours.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[13px] font-bold">How many of each?</div>
                    <div className="-mt-1 text-xs text-muted-foreground">Type the quantity. Leave 0 if you don't have it.</div>
                    <div className="overflow-x-auto rounded-xl border border-border p-3">
                      <div className="grid items-center gap-2" style={{ gridTemplateColumns: `72px repeat(${stockKeys.length}, minmax(48px, 1fr))` }}>
                        <span />
                        {stockKeys.map((sz) => <span key={sz || "qty"} className="text-center text-xs font-bold text-muted-foreground">{sz || "Qty"}</span>)}
                        {colours.map((c) => (
                          <div key={c.id} className="contents">
                            <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                              <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: swatchFor(c.name) }} />
                              <span className="truncate">{c.name}</span>
                            </span>
                            {stockKeys.map((sz) => {
                              const k = `${c.id}|${sz}`;
                              const val = stock[k] ?? "";
                              return (
                                <input key={k} inputMode="numeric" aria-label={`${c.name} ${sz || ""} quantity`} value={val} placeholder="0"
                                  onChange={(e) => setStock((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                                  className={`h-11 min-w-0 rounded-lg border text-center text-[15px] font-bold outline-none focus:border-primary ${val && val !== "0" ? "border-border bg-background" : "border-border/60 bg-muted/50 text-muted-foreground"}`} />
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3.5 py-3">
                      <span className="text-[13px] text-primary">Total in stock (automatic)</span>
                      <strong className="text-lg text-primary">{totalStock}</strong>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-bold">Photos (at least 3)</div>
                  <div className="flex flex-wrap gap-2">
                    {singlePhotos.map((u) => (
                      <button key={u} type="button" aria-label="Remove photo" onClick={() => removePhoto("__single", u)} className="relative h-[90px] w-[72px] overflow-hidden rounded-xl border border-border">
                        <img src={u} alt="" className="h-full w-full object-cover" />
                        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white">×</span>
                      </button>
                    ))}
                    {singlePhotos.length < 8 && (
                      <label className="grid h-[90px] w-[72px] cursor-pointer place-items-center rounded-xl border border-dashed border-muted-foreground text-2xl text-primary">
                        {uploadingFor === "__single" ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : "+"}
                        <input type="file" accept="image/*" multiple className="sr-only" aria-label="Add photos" onChange={(e) => { void handlePhotos(e.target.files, "__single"); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-[13px] font-bold">How many do you have?</div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Fewer" onClick={() => setSingleQty(String(Math.max(0, (parseInt(singleQty, 10) || 0) - 1)))} className="h-[52px] w-[52px] rounded-xl border border-border text-2xl">−</button>
                    <input aria-label="Quantity in stock" inputMode="numeric" value={singleQty} onChange={(e) => setSingleQty(e.target.value.replace(/\D/g, "").slice(0, 5))} className="h-[52px] w-[90px] rounded-xl border border-border bg-background text-center text-xl font-extrabold" />
                    <button type="button" aria-label="More" onClick={() => setSingleQty(String((parseInt(singleQty, 10) || 0) + 1))} className="h-[52px] w-[52px] rounded-xl border border-border text-2xl">+</button>
                  </div>
                  <div className="text-xs text-muted-foreground">Goes down by itself when an order is paid.</div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            {isBeauty && (
              <>
                <p className="text-xs text-muted-foreground">No body or clothing measurements for beauty products.</p>
                {step3BeautyFields.map((f) => (
                  <DynamicInput key={f.name} field={f} value={specific[f.name]} onChange={(v) => setSpecific((p) => ({ ...p, [f.name]: v }))} />
                ))}
              </>
            )}

            {!isBeauty && measureMode.mode === "none" && (
              <div className="rounded-2xl border border-border bg-muted/30 p-5 text-sm leading-relaxed">
                <strong className="block text-base">Nothing to measure</strong>
                {category?.name ? `${category.name} don't need a size chart.` : "This item doesn't need a size chart."} Press Publish to put it in your store.
              </div>
            )}

            {guide && guideId && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-bold">{guide.kind ? guide.label : "Type of clothing"}</span>
                    {category?.name && <span className="text-xs text-muted-foreground">Set from category: {category.name}</span>}
                  </div>
                  {/* Clothing can switch picture (e.g. short vs long sleeve); shoes, bags
                      and hijabs are fixed by their category. Selected type shown first. */}
                  {!guide.kind && <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                    {[guideId, ...GARMENT_GUIDE_CHOICES.filter((g) => g !== guideId && !MEASUREMENT_GUIDES[g].kind)].map((g) => (
                      <button key={g} type="button" aria-pressed={g === guideId} onClick={() => setGuideOverride(g)}
                        className={`h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold ${g === guideId ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>
                        {MEASUREMENT_GUIDES[g].label}
                      </button>
                    ))}
                  </div>}
                </div>

                <div className="flex gap-3.5 rounded-2xl border border-border bg-white p-3 text-[#4A4640]">
                  <img src={measurementPicture(guideId)} alt={`${guide.label} measuring guide`} className="h-[170px] w-[130px] shrink-0 object-contain" />
                  <div className="flex min-w-0 flex-col gap-2 text-xs leading-snug">
                    <strong className="text-[13px] text-[#161616]">How to measure</strong>
                    {guide.howTo.map((h) => <span key={h}>{h}</span>)}
                    <div className="mt-auto grid grid-cols-2 gap-1">
                      {(["cm", "in"] as const).map((u) => (
                        <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}
                          className={`h-9 rounded-lg text-sm font-bold ${unit === u ? "bg-[#161616] text-white" : "border border-[#D9D6D0] bg-white text-[#161616]"}`}>{u === "cm" ? "cm" : "inches"}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {isShoes ? (
                  <div className="flex flex-col gap-2">
                    <div className="text-[13px] font-bold">Size chart</div>
                    <div className="overflow-x-auto rounded-xl border border-border p-2.5">
                      <div className="grid grid-cols-4 items-center gap-2">
                        {["EU", "UK", "US", `1 Foot ${unit}`].map((h) => <span key={h} className="text-center text-[11px] font-bold text-muted-foreground">{h}</span>)}
                        {sizeLabels.map((sz) => {
                          const r = shoeRow(sz);
                          const set = (k: "uk" | "us" | "footLength", v: string) => setShoeChart((p) => ({ ...p, [sz]: { ...shoeRow(sz), ...(p[sz] || {}), [k]: v.replace(/[^0-9.]/g, "") } }));
                          return (
                            <div key={sz} className="contents">
                              <span className="grid h-11 place-items-center rounded-lg bg-muted font-extrabold">{sz}</span>
                              <input aria-label={`UK size for ${sz}`} inputMode="decimal" value={r.uk} onChange={(e) => set("uk", e.target.value)} className="h-11 min-w-0 rounded-lg border border-border bg-background text-center font-bold" />
                              <input aria-label={`US size for ${sz}`} inputMode="decimal" value={r.us} onChange={(e) => set("us", e.target.value)} placeholder="–" className="h-11 min-w-0 rounded-lg border border-border bg-background text-center font-bold" />
                              <input aria-label={`Foot length for ${sz}`} inputMode="decimal" value={r.footLength} onChange={(e) => set("footLength", e.target.value)} className="h-11 min-w-0 rounded-lg border border-border bg-background text-center font-bold" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">Sizes come from step 2. UK and foot length are pre-filled from the standard chart; change them if your brand differs.</div>
                    <div className="mt-2 text-[13px] font-bold">How do they fit?</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([["small", "Runs small"], ["true", "True to size"], ["large", "Runs large"]] as const).map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={shoeFit === k} onClick={() => setShoeFit(k)}
                          className={`h-11 rounded-xl text-[13px] font-semibold ${shoeFit === k ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {!oneSizeGuide && measureSizes.length > 1 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[13px] font-bold">Size</span>
                          {measureSizes.indexOf(currentMeasureSize) > 0 && (
                            <button type="button" onClick={copyFromPrevious} className="h-8 text-xs font-bold text-primary">
                              Copy from {measureSizes[measureSizes.indexOf(currentMeasureSize) - 1]}
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto rounded-xl bg-muted p-1 [scrollbar-width:none]">
                          {measureSizes.map((sz) => {
                            const done = guide.fields.every((f) => String(measures[sz]?.[f.key] || "").trim());
                            const on = sz === currentMeasureSize;
                            return (
                              <button key={sz} type="button" aria-pressed={on} onClick={() => setActiveSize(sz)}
                                className={`h-10 min-w-[56px] flex-1 rounded-lg px-2 text-sm ${on ? "bg-background font-extrabold shadow" : "font-semibold"}`}>
                                {sz}{done ? " ✓" : ""}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2.5">
                      {guide.fields.map((f, i) => (
                        <div key={f.key} className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={`m-${f.key}`} className="flex items-center gap-1.5 text-xs font-semibold">
                            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-foreground text-[10px] text-background">{i + 1}</span>{f.label}
                          </label>
                          <div className="flex h-12 items-center rounded-xl border border-border bg-background px-3 focus-within:border-primary">
                            <input id={`m-${f.key}`} inputMode="decimal" value={measures[currentMeasureSize]?.[f.key] || ""}
                              onChange={(e) => setMeasure(currentMeasureSize, f.key, e.target.value)}
                              className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none" />
                            <span className="text-xs text-muted-foreground">{unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {!oneSizeGuide && (
                      <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
                        <div className="flex items-center gap-3">
                          <img src={measurementPicture(bodyGuideId)} alt="" className="h-[72px] w-[40px] rounded bg-white object-contain" />
                          <div className="flex-1">
                            <div className="text-sm font-semibold">Also add body sizes</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">Optional: the body each size fits</div>
                          </div>
                          <Toggle on={withBody} onChange={setWithBody} label="Also add body sizes" />
                        </div>
                        {withBody && (
                          <div className="grid grid-cols-2 gap-2.5">
                            {BODY_GUIDES[bodyGuideId].fields.map((f, i) => (
                              <div key={f.key} className="flex min-w-0 flex-col gap-1">
                                <label htmlFor={`b-${f.key}`} className="text-xs font-semibold">{i + 1}. {f.label}{measureSizes.length > 1 ? ` (${currentMeasureSize})` : ""}</label>
                                <div className="flex h-11 items-center rounded-xl border border-border bg-background px-3">
                                  <input id={`b-${f.key}`} inputMode="decimal" value={bodyMeasures[currentMeasureSize]?.[f.key] || ""}
                                    onChange={(e) => setMeasure(currentMeasureSize, f.key, e.target.value, true)} className="min-w-0 flex-1 bg-transparent font-bold outline-none" />
                                  <span className="text-xs text-muted-foreground">{unit}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-border px-5 pb-[max(14px,env(safe-area-inset-bottom,0px))] pt-3">
        {error && <p role="alert" className="mb-2.5 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">{error}</p>}
        <div className="flex gap-2.5">
          {step > 1 && (
            <button type="button" onClick={() => setStep(step - 1)} disabled={saving} className="h-[50px] rounded-xl border border-border px-4 font-bold">← Back</button>
          )}
          <button type="button" onClick={next} disabled={saving || !!uploadingFor}
            className="h-[50px] flex-1 rounded-xl bg-primary text-[15px] font-extrabold text-primary-foreground disabled:opacity-60">
            {saving ? "Publishing…" : uploadingFor ? "Uploading photo…" : step === 1 ? (isBeauty ? "Next: Prices & shades →" : "Next: Prices & colours →") : step === 2 ? (isBeauty ? "Next: Size & facts →" : isShoes ? "Next: Shoe sizes →" : measureMode.mode === "none" ? "Next →" : "Next: Measurements →") : "Publish product"}
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
