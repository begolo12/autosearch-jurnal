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
      navigator.serviceWorker.register("/sw.js").catch(() => {
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

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
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
        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#E2CDD8] bg-white px-3 py-1.5 text-xs font-medium text-[#18181B] transition-colors duration-150 hover:border-[#DB2777] hover:text-[#DB2777]"
      >
        {installPrompt ? (
          <Download className="h-3.5 w-3.5 text-[#DB2777]" />
        ) : (
          <Share className="h-3.5 w-3.5 text-[#DB2777]" />
        )}
        <span>Pasang App</span>
      </button>

      {showIosGuide && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-lg border border-[#E2CDD8] bg-white p-3 text-xs text-[#18181B] shadow-md">
          <div className="mb-1 flex items-center justify-between font-semibold">
            <span>Pasang SmartSari di iPhone/iPad</span>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="text-[#71717A]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-[#52525B]">
            Ketuk tombol <strong>Bagikan (Share)</strong> di Safari, lalu pilih{" "}
            <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
