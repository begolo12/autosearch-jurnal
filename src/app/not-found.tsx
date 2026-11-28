import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent-soft">
          <FileQuestion className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold tracking-wider text-accent-soft">
          404
        </p>
        <h1 className="mt-1 text-lg font-bold text-heading">
          Halaman Tidak Ditemukan
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
          Tautan yang Anda buka mungkin telah berpindah atau tidak tersedia.
        </p>
        <Link
          href="/"
          className="btn-tactile mt-6 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke SmartSari by AirEvo
        </Link>
      </div>
    </div>
  );
}
