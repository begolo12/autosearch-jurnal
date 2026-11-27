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
    <div className="flex min-h-screen items-center justify-center bg-[#0E0F12] px-4 text-[#F4F4F5]">
      <div className="w-full max-w-md rounded-2xl border border-[#2C2E35] bg-[#151619] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EF4444]/15 text-[#F87171]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-white">
          Terjadi Gangguan Sementara
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
          Halaman mengalami kendala saat dimuat. Silakan muat ulang atau kembali
          ke beranda SmartSari.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-2 text-xs font-semibold text-white hover:bg-[#BE185D]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Coba Lagi
          </button>
          <Link
            href="/"
            className="btn-tactile inline-flex items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-4 py-2 text-xs font-medium text-[#E4E4E7] hover:border-[#F472B6]/45 hover:text-white"
          >
            <Home className="h-3.5 w-3.5" />
            Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
