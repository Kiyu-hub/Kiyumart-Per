/**
 * One source of truth for light / dark mode.
 *
 * The shopper's choice is saved in localStorage("theme"); with no saved choice
 * the phone's own setting is used. It is applied to <html class="dark"> the
 * moment the app starts (see main.tsx and the inline script in index.html),
 * so every page — opened directly or not — shows the same theme.
 * Pages read it with useIsDark() and must not hard-code dark or light.
 */
import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark";
const KEY = "theme";

function systemPrefersDark(): boolean {
  try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
}

export function savedTheme(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch { return null; }
}

export function currentTheme(): ThemeChoice {
  return savedTheme() ?? (systemPrefersDark() ? "dark" : "light");
}

export function applyTheme(theme: ThemeChoice = currentTheme()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#ffffff");
}

export function setTheme(theme: ThemeChoice): void {
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: still apply */ }
  applyTheme(theme);
}

export function toggleTheme(): ThemeChoice {
  const next: ThemeChoice = document.documentElement.classList.contains("dark") ? "light" : "dark";
  setTheme(next);
  return next;
}

/** Keeps the theme in step with the phone setting (when no choice is saved) and other tabs. */
export function installThemeSync(): void {
  if (typeof window === "undefined") return;
  applyTheme();
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!savedTheme()) applyTheme(); });
  } catch { /* old browsers */ }
  window.addEventListener("storage", (e) => { if (e.key === KEY) applyTheme(); });
}

/** True while the app is in dark mode; updates when the shopper switches. */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}
