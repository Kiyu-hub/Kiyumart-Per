/**
 * Buyer-facing measurement guide: the seller's measuring picture with the
 * numbered points listed beside their values for the chosen size, a cm/inches
 * switch, the shoe chart for shoes, and the optional body chart.
 */
import { useState } from "react";
import {
  MEASUREMENT_GUIDES,
  BODY_GUIDES,
  measurementPicture,
  type MeasurementGuideData,
} from "@/lib/measurementGuides";

const toUnit = (raw: string | undefined, from: "cm" | "in", to: "cm" | "in") => {
  const n = Number(String(raw || "").trim());
  if (!raw || !Number.isFinite(n) || n <= 0) return "–";
  if (from === to) return `${n % 1 === 0 ? n : n.toFixed(1)}`;
  const v = to === "in" ? n / 2.54 : n * 2.54;
  return v.toFixed(1);
};

export function isMeasurementGuide(value: unknown): value is MeasurementGuideData {
  const v = value as MeasurementGuideData;
  return !!v && typeof v === "object" && typeof v.type === "string" && !!MEASUREMENT_GUIDES[v.type] && !!v.rows && typeof v.rows === "object";
}

/**
 * One row of size buttons does both jobs: on the product page the parent passes
 * the sizes you can buy plus the selected size, so tapping a size selects it
 * AND shows its measurements (no second "choose your size" row).
 */
export default function MeasurementGuideView({ data, initialSize, sizes: buyableSizes, selectedSize, onSelectSize, onlySize, gender, ink = "#181818", subtle = "#6D6A65", edge = "#E8E5DF", brand = "#009688" }: {
  data: MeasurementGuideData;
  initialSize?: string;
  /** Sizes the shopper can buy; when given with onSelectSize the buttons select the size. */
  sizes?: string[];
  selectedSize?: string;
  onSelectSize?: (size: string) => void;
  /** Show just this size (the one the shopper already picked); no size buttons. */
  onlySize?: string;
  ink?: string; subtle?: string; edge?: string; brand?: string;
  /** The product's "Target gender" (Men / Women / Unisex…): picks the body figure. */
  gender?: string | null;
}) {
  const guide = MEASUREMENT_GUIDES[data.type];
  const measuredSizes = Object.keys(data.rows || {});
  const controlled = !!onSelectSize && Array.isArray(buyableSizes) && buyableSizes.length > 0;
  const sizes = controlled ? buyableSizes! : measuredSizes;
  const [unit, setUnit] = useState<"cm" | "in">(data.unit || "cm");
  const [localSize, setLocalSize] = useState<string>(
    sizes.find((s) => s.toLowerCase() === String(initialSize || "").toLowerCase()) || sizes[0] || "",
  );
  if (!guide) return null;
  const size = onlySize ? onlySize : controlled ? (selectedSize || "") : localSize;
  const setSize = (s: string) => (controlled ? onSelectSize!(s) : setLocalSize(s));
  const rowKey = guide.oneSize
    ? measuredSizes[0]
    : measuredSizes.find((k) => k.toLowerCase() === size.toLowerCase());
  const row = (rowKey && data.rows[rowKey]) || {};
  const hasRow = !!rowKey;
  const isShoes = guide.kind === "shoes";
  const body = data.body && BODY_GUIDES[data.body.guide] ? data.body : null;
  // Body figure: the seller's chosen body chart, else from the product's target gender.
  const g = String(gender || "").toLowerCase();
  const bodyGuideId: "body-men" | "body-women" = body?.guide
    ?? (/\b(men|man|male|boys?|gents?)\b/.test(g) && !/women|woman|female|ladies|girls?/.test(g) ? "body-men" : "body-women");
  const bodyRow = body && rowKey ? body.rows[rowKey] : null;
  const hasBodyValues = !!bodyRow && Object.values(bodyRow).some(Boolean);
  // Worn on the body (not shoes, bags, scarves or baby clothes).
  const showBody = !isShoes && !guide.oneSize && data.type !== "baby";
  const fitLabel = data.shoeFit === "small" ? "Runs small: consider a size up" : data.shoeFit === "large" ? "Runs large: consider a size down" : data.shoeFit === "true" ? "True to size" : null;
  const pill = (on: boolean): React.CSSProperties => ({
    minWidth: 48, height: 40, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontWeight: on ? 800 : 600,
    border: on ? `2px solid ${brand}` : `1px solid ${edge}`, background: on ? brand : "transparent", color: on ? "#fff" : ink,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: subtle }}>{guide.label}</span>
        <div style={{ display: "flex", gap: 4, background: edge, borderRadius: 10, padding: 3 }}>
          {(["cm", "in"] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}
              style={{ border: 0, borderRadius: 8, height: 32, padding: "0 12px", fontWeight: 700, cursor: "pointer", background: unit === u ? "#fff" : "transparent", color: "#181818" }}>
              {u === "cm" ? "cm" : "inches"}
            </button>
          ))}
        </div>
      </div>

      {onlySize && !guide.oneSize && (
        <div style={{ fontSize: 15, fontWeight: 800, color: ink }}>Your size: {isShoes && /^\d/.test(onlySize) ? `EU ${onlySize}` : onlySize}</div>
      )}
      {!onlySize && (controlled ? sizes.length > 0 : !guide.oneSize && sizes.length > 1) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {controlled && <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{size ? `Size: ${size}` : "Choose your size"}</span>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sizes.map((s) => {
              const on = s.toLowerCase() === size.toLowerCase();
              return <button key={s} type="button" aria-pressed={on} onClick={() => setSize(s)} style={pill(on)}>{isShoes && /^\d/.test(s) ? `EU ${s}` : s}</button>;
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 14, alignItems: "center", background: "#fff", borderRadius: 16, padding: 12, border: `1px solid ${edge}` }}>
        <img src={measurementPicture(data.type)} alt={`${guide.label} measurements`} style={{ width: 120, height: 156, objectFit: "contain", flexShrink: 0 }} />
        <dl style={{ margin: 0, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8, color: "#181818" }}>
          {guide.fields.map((f, i) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: "#161616", color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>{i + 1}</span>
              <dt style={{ flex: 1, color: "#4A4640" }}>{f.label}</dt>
              <dd style={{ margin: 0, fontWeight: 800 }}>{toUnit(row[f.key], data.unit || "cm", unit)}{row[f.key] ? ` ${unit}` : ""}</dd>
            </div>
          ))}
          {isShoes && rowKey && data.shoeSizes?.[rowKey] && (
            <div style={{ fontSize: 12, color: "#4A4640", marginTop: 2 }}>
              EU {rowKey}{data.shoeSizes[rowKey].uk ? ` · UK ${data.shoeSizes[rowKey].uk}` : ""}{data.shoeSizes[rowKey].us ? ` · US ${data.shoeSizes[rowKey].us}` : ""}
            </div>
          )}
        </dl>
      </div>

      {!hasRow && size && !guide.oneSize && (
        <div style={{ fontSize: 12, color: subtle }}>The seller hasn't added measurements for size {size}.</div>
      )}
      {fitLabel && <div style={{ fontSize: 13, fontWeight: 700, color: brand }}>{fitLabel}</div>}

      {showBody && (
        <div style={{ display: "flex", gap: 16, alignItems: "center", borderTop: `1px solid ${edge}`, paddingTop: 16 }}>
          <img src={measurementPicture(bodyGuideId)} alt={bodyGuideId === "body-men" ? "Men's body measurements" : "Women's body measurements"}
            style={{ width: 96, height: 192, objectFit: "contain", background: "#fff", borderRadius: 12, border: `1px solid ${edge}`, flexShrink: 0, padding: 6 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: ink, marginBottom: 4 }}>
              {hasBodyValues ? `Fits this body${!guide.oneSize && sizes.length > 1 && size ? ` (size ${size})` : ""}` : "Measure yourself"}
            </div>
            {!hasBodyValues && (
              <div style={{ fontSize: 12, color: subtle, lineHeight: 1.5, marginBottom: 6 }}>
                Measure over light clothing, tape snug but not tight, then compare with the sizes above.
              </div>
            )}
            {BODY_GUIDES[bodyGuideId].fields.map((f, i) => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", color: subtle }}>
                <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: "50%", background: "#161616", color: "#fff", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1 }}>{f.label}</span>
                {hasBodyValues && <strong style={{ color: ink }}>{toUnit(bodyRow?.[f.key], data.unit || "cm", unit)}{bodyRow?.[f.key] ? ` ${unit}` : ""}</strong>}
              </div>
            ))}
          </div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12, color: subtle, lineHeight: 1.6 }}>Measured by the seller with the item lying flat. Allow 1–2 cm difference.</p>
    </div>
  );
}
