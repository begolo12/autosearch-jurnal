"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegistrar() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Ignore registration errors in restricted webviews
      });
    }

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (!installPrompt) return null;

  const handleInstall = async () => {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstall()}
      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#C9C4B8] bg-white px-2.5 py-1 text-xs font-medium text-[#161513] transition-colors duration-150 hover:border-[#154033] hover:text-[#154033]"
    >
      <Download className="h-3.5 w-3.5" />
      <span>Pasang Aplikasi</span>
    </button>
  );
}
