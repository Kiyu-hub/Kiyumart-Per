import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { goBack } from "@/lib/navigation";

/*
 * Shared pieces for the phone pages the profile opens (approved 28 Nov 2026,
 * docs/design/profile-pages-20261128): back arrow + centred title, plain white
 * page, desktop (lucide) icons without coloured backgrounds, thin dividers,
 * KiyuMart teal for buttons and switches. Phone only; desktop pages unchanged.
 */

export const SUB_F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
export const SUB_TEAL = "#00796B";

export function useSubpageDark() {
  const read = () => {
    if (typeof window === "undefined") return false;
    const s = localStorage.getItem("theme");
    return s ? s === "dark" : document.documentElement.classList.contains("dark");
  };
  const [isDark, setIsDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export function subpageColors(isDark: boolean) {
  return {
    bg: isDark ? "#111111" : "#FFFFFF",
    ink: isDark ? "#FFFFFF" : "#1A1A1A",
    soft: isDark ? "rgba(235,235,245,0.6)" : "#6B6B6B",
    faint: isDark ? "rgba(235,235,245,0.45)" : "#8A8A8A",
    line: isDark ? "rgba(255,255,255,0.08)" : "#EFEFEF",
    border: isDark ? "rgba(255,255,255,0.18)" : "#D6D6D6",
    field: isDark ? "#111111" : "#FFFFFF",
    fieldRO: isDark ? "#1C1C1E" : "#F7F7F7",
    chev: isDark ? "rgba(255,255,255,0.3)" : "#B5B5B5",
    link: isDark ? "#4DB6AC" : SUB_TEAL,
  };
}

export function MobileSubpageHeader({ title, onBack, right, isDark }: { title: string; onBack?: () => void; right?: ReactNode; isDark: boolean }) {
  const c = subpageColors(isDark);
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", height: 56, padding: "0 8px", paddingTop: "env(safe-area-inset-top, 0px)", background: c.bg, fontFamily: SUB_F }}>
      <button aria-label="Back" onClick={onBack ?? (() => goBack("/profile"))} style={{ width: 44, height: 44, border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <ChevronLeft size={24} strokeWidth={2} color={c.ink} aria-hidden="true" />
      </button>
      <h1 style={{ flex: 1, margin: 0, textAlign: "center", fontSize: 17, fontWeight: 700, color: c.ink }}>{title}</h1>
      <div style={{ width: 44, display: "grid", placeItems: "center" }}>{right}</div>
    </header>
  );
}

export function SubpageShell({ title, isDark, right, onBack, children, testId }: { title: string; isDark: boolean; right?: ReactNode; onBack?: () => void; children: ReactNode; testId?: string }) {
  const c = subpageColors(isDark);
  return (
    <div data-testid={testId} style={{ minHeight: "100dvh", background: c.bg, color: c.ink, fontFamily: SUB_F, paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom)))" }}>
      <MobileSubpageHeader title={title} isDark={isDark} right={right} onBack={onBack} />
      {children}
    </div>
  );
}

export function SubpageLabel({ children, isDark }: { children: ReactNode; isDark: boolean }) {
  return <p style={{ margin: 0, padding: "24px 24px 4px", fontSize: 13, fontWeight: 600, color: subpageColors(isDark).faint }}>{children}</p>;
}

export function SubpagePrimary({ children, onClick, disabled, top = 24, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; top?: number; type?: "button" | "submit" }) {
  return (
    <div style={{ padding: `${top}px 24px 0` }}>
      <button type={type} onClick={onClick} disabled={disabled} style={{ width: "100%", height: 52, border: 0, borderRadius: 26, background: SUB_TEAL, color: "#FFFFFF", fontSize: 16, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, fontFamily: SUB_F }}>
        {children}
      </button>
    </div>
  );
}

export function SubpageSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} style={{ width: 51, height: 31, borderRadius: 16, border: 0, padding: 0, background: checked ? SUB_TEAL : "#C9C9C9", position: "relative", flexShrink: 0, cursor: "pointer", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: checked ? 22 : 2, width: 27, height: 27, borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left .15s" }} />
    </button>
  );
}

export function SubpageTabs<T extends string>({ tabs, value, onChange, isDark }: { tabs: Array<{ key: T; label: string }>; value: T; onChange: (k: T) => void; isDark: boolean }) {
  const c = subpageColors(isDark);
  return (
    <div role="tablist" style={{ display: "flex", padding: "0 16px", borderBottom: `1px solid ${c.line}` }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} role="tab" aria-selected={on} onClick={() => onChange(t.key)} style={{ flex: 1, height: 44, border: 0, borderBottom: `2px solid ${on ? c.ink : "transparent"}`, background: "transparent", fontSize: 14, fontWeight: on ? 700 : 500, color: on ? c.ink : c.soft, cursor: "pointer", fontFamily: SUB_F }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export const subFieldStyle = (isDark: boolean, readOnly = false, padRight = 14) => {
  const c = subpageColors(isDark);
  return {
    width: "100%", boxSizing: "border-box" as const, height: 48, border: `1px solid ${c.border}`, borderRadius: 12,
    padding: `0 ${padRight}px 0 14px`, fontSize: 16, color: readOnly ? c.faint : c.ink,
    background: readOnly ? c.fieldRO : c.field, fontFamily: SUB_F, outline: "none",
  };
};

export const subLabelStyle = (isDark: boolean) => ({
  display: "flex", flexDirection: "column" as const, gap: 6, fontSize: 14, fontWeight: 600, color: subpageColors(isDark).ink,
});
