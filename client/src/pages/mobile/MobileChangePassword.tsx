import { useState } from "react";
import { useLocation } from "wouter";
import { Check, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SubpageShell, SubpagePrimary, subFieldStyle, subLabelStyle, subpageColors, useSubpageDark, SUB_TEAL } from "@/components/mobile/MobileSubpage";

/** Phone "Change password" (approved 28 Nov 2026). Same rules and endpoint as the desktop page. */
export function MobileChangePassword() {
  const isDark = useSubpageDark();
  const c = subpageColors(isDark);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);

  const rules = [
    { label: "At least 8 characters", ok: next.length >= 8 },
    { label: "One uppercase letter", ok: /[A-Z]/.test(next) },
    { label: "One lowercase letter", ok: /[a-z]/.test(next) },
    { label: "One number", ok: /[0-9]/.test(next) },
  ];
  const allOk = rules.every((r) => r.ok);
  const matches = confirm.length > 0 && confirm === next;
  const canSave = current.length > 0 && allOk && matches && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to change password");
      }
      toast({ title: "Password changed", description: "Your password has been updated." });
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => navigate("/profile"), 1200);
    } catch (e: any) {
      toast({ title: "Couldn't change password", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const pwField = (label: string, key: "current" | "next" | "confirm", value: string, set: (v: string) => void, placeholder: string, autoComplete: string) => (
    <label style={subLabelStyle(isDark)}>
      {label}
      <span style={{ position: "relative", display: "block" }}>
        <input type={show[key] ? "text" : "password"} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} style={subFieldStyle(isDark, false, 48)} />
        <button type="button" aria-label={show[key] ? "Hide password" : "Show password"} onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))} style={{ position: "absolute", right: 6, top: 6, width: 36, height: 36, border: 0, background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}>
          {show[key] ? <EyeOff size={20} color={c.faint} aria-hidden="true" /> : <Eye size={20} color={c.faint} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );

  return (
    <SubpageShell title="Change password" isDark={isDark} testId="mobile-change-password">
      <p style={{ margin: "8px 24px 0", fontSize: 14, color: c.soft, lineHeight: 1.5 }}>Use a strong password you don't use anywhere else.</p>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "20px 24px 0" }}>
          {pwField("Current password", "current", current, setCurrent, "Enter your current password", "current-password")}
          {pwField("New password", "next", next, setNext, "Enter a new password", "new-password")}
          <ul style={{ listStyle: "none", margin: "-6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {rules.map((r) => (
              <li key={r.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: r.ok ? (isDark ? "#4DB6AC" : SUB_TEAL) : c.faint }}>
                <Check size={16} strokeWidth={2.2} aria-hidden="true" />{r.label}
              </li>
            ))}
          </ul>
          {pwField("Confirm new password", "confirm", confirm, setConfirm, "Type it again", "new-password")}
          {confirm.length > 0 && !matches && <span style={{ marginTop: -10, fontSize: 13, color: "#D93025" }}>Passwords don't match</span>}
        </div>
        <SubpagePrimary type="submit" disabled={!canSave} top={28}>{saving ? "Updating…" : "Update password"}</SubpagePrimary>
      </form>
      <div style={{ textAlign: "center", paddingTop: 12 }}>
        <button onClick={() => navigate("/auth?mode=forgot")} style={{ border: 0, background: "transparent", fontSize: 14, color: c.link, fontWeight: 600, padding: 10, cursor: "pointer" }}>Forgot your password?</button>
      </div>
    </SubpageShell>
  );
}
