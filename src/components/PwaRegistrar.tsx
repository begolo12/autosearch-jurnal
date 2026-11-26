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
        className="btn-tactile inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3.5 py-1.5 text-xs font-medium text-[#E4E4E7] hover:border-[#DB2777]/60 hover:text-white"
      >
        {installPrompt ? (
          <Download className="h-3.5 w-3.5 text-[#F472B6]" />
        ) : (
          <Share className="h-3.5 w-3.5 text-[#F472B6]" />
        )}
        <span>Pasang App</span>
      </button>

      {showIosGuide && (
        <div className="animate-panel-open absolute right-0 top-10 z-40 w-64 rounded-xl border border-[#2C2E35] bg-[#151619] p-3.5 text-xs text-[#F4F4F5] shadow-xl">
          <div className="mb-1 flex items-center justify-between font-semibold">
            <span>Pasang SmartSari di iPhone/iPad</span>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="text-[#A1A1AA] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-[#A1A1AA]">
            Ketuk tombol <strong className="text-white">Bagikan (Share)</strong>{" "}
            di Safari, lalu pilih{" "}
            <strong className="text-white">
              Tambah ke Layar Utama (Add to Home Screen)
            </strong>
            .
          </p>
        </div>
      )}
    </div>
  );
}
