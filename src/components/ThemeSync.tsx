"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  applyAppearanceToDom,
  getActiveResolvedTheme,
  getStoredAppearance,
  saveAppearance,
} from "@/lib/appearance";

/** Keeps document theme and palette synchronized across tabs and system changes. */
export function ThemeSync() {
  useEffect(() => {
    const sync = () => {
      applyAppearanceToDom(getStoredAppearance());
    };
    sync();

    const mql =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: light)")
        : null;
    const onSystemChange = () => {
      if (getStoredAppearance().theme === "system") {
        sync();
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.includes("appearance")) {
        sync();
      }
    };

    window.addEventListener("smartsari:appearance-changed", sync);
    window.addEventListener("storage", onStorage);
    mql?.addEventListener("change", onSystemChange);
    return () => {
      window.removeEventListener("smartsari:appearance-changed", sync);
      window.removeEventListener("storage", onStorage);
      mql?.removeEventListener("change", onSystemChange);
    };
  }, []);

  return null;
}

/** Compact Dark/Light toggle button used on legal and contact pages. */
export function ThemeQuickToggle() {
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const update = () => setResolved(getActiveResolvedTheme());
    update();
    window.addEventListener("smartsari:appearance-changed", update);
    return () => {
      window.removeEventListener("smartsari:appearance-changed", update);
    };
  }, []);

  const handleToggle = () => {
    const current = getStoredAppearance();
    const nextTheme = resolved === "light" ? "dark" : "light";
    saveAppearance({ ...current, theme: nextTheme });
    setResolved(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={
        resolved === "light"
          ? "Beralih ke tema gelap"
          : "Beralih ke tema terang"
      }
      title={
        resolved === "light" ? "Mode Terang (klik untuk Gelap)" : "Mode Gelap (klik untuk Terang)"
      }
      className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-body transition-colors hover:border-accent-soft/45 hover:text-heading"
    >
      {resolved === "light" ? (
        <Moon className="h-3.5 w-3.5 text-accent-soft" />
      ) : (
        <Sun className="h-3.5 w-3.5 text-accent-soft" />
      )}
      <span>{resolved === "light" ? "Gelap" : "Terang"}</span>
    </button>
  );
}
