"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegistrar() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIosHint, setIsIosHint] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {
          // Ignore registration errors in restricted webviews
        });
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    if (isIos && !isStandalone) {
      setTimeout(() => setIsIosHint(true), 0);
    }

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsIosHint(false);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!installPrompt && !isIosHint) return null;

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
      }
    } else if (isIosHint) {
      setShowIosGuide((v) => !v);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="btn-tactile inline-flex min-h-[38px] sm:min-h-[34px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent/60 hover:text-heading"
      >
        {installPrompt ? (
          <Download className="h-3.5 w-3.5 text-accent-soft" />
        ) : (
          <Share className="h-3.5 w-3.5 text-accent-soft" />
        )}
        <span className="hidden sm:inline">Pasang App</span>
      </button>

      {showIosGuide && (
        <div className="animate-panel-open absolute right-0 top-11 z-40 w-64 rounded-xl border border-line-strong bg-surface p-3.5 text-xs text-ink shadow-xl">
          <div className="mb-1 flex items-center justify-between font-semibold text-heading">
            <span>Pasang SmartSari di iPhone/iPad</span>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="text-ink-secondary hover:text-heading"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-ink-secondary">
            Ketuk tombol <strong className="text-heading">Bagikan (Share)</strong>{" "}
            di Safari, lalu pilih{" "}
            <strong className="text-heading">
              Tambah ke Layar Utama (Add to Home Screen)
            </strong>
            .
          </p>
        </div>
      )}
    </div>
  );
}
