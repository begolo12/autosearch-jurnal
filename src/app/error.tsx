"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertCircle, Home, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SmartSari] Unhandled UI error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EF4444]/15 text-danger">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-heading">
          Terjadi Gangguan Sementara
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
          Halaman mengalami kendala saat dimuat. Silakan muat ulang atau kembali
          ke beranda SmartSari by AirEvo.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Coba Lagi
          </button>
          <Link
            href="/"
            className="btn-tactile inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-4 py-2 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading"
          >
            <Home className="h-3.5 w-3.5" />
            Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
