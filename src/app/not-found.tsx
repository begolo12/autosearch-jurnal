import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0E0F12] px-4 text-[#F4F4F5]">
      <div className="w-full max-w-md rounded-2xl border border-[#2C2E35] bg-[#151619] p-7 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DB2777]/15 text-[#F472B6]">
          <FileQuestion className="h-6 w-6" />
        </div>
        <p className="font-mono text-xs font-semibold tracking-wider text-[#F472B6]">
          404
        </p>
        <h1 className="mt-1 text-lg font-bold text-white">
          Halaman Tidak Ditemukan
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
          Tautan yang Anda buka mungkin telah berpindah atau tidak tersedia.
        </p>
        <Link
          href="/"
          className="btn-tactile mt-6 inline-flex items-center gap-1.5 rounded-full bg-[#DB2777] px-5 py-2 text-xs font-semibold text-white hover:bg-[#BE185D]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Kembali ke SmartSari
        </Link>
      </div>
    </div>
  );
}
