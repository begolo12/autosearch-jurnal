import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = {
  title: "Kontak & Bantuan — SmartSari",
  description:
    "Hubungi tim SmartSari untuk bantuan teknis, masukan fitur, atau permintaan penghapusan data pribadi sesuai UU PDP.",
};

export default function KontakPage() {
  return (
    <div className="min-h-screen bg-[#0E0F12] px-4 py-10 text-[#F4F4F5] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#151619] px-3.5 py-1.5 text-xs font-medium text-[#D4D4D8] transition-colors hover:border-[#F472B6]/45 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-[#F472B6]" />
          Kembali ke SmartSari
        </Link>

        <header className="mb-8 border-b border-[#232429] pb-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#DB2777]/30 bg-[#DB2777]/10 px-3 py-1 text-xs font-medium text-[#F9A8D4]">
            <Mail className="h-3.5 w-3.5" />
            Layanan Pengguna &amp; Privasi
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            Hubungi SmartSari
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
            Kirimkan pertanyaan teknis, laporan kendala, atau permintaan
            penghapusan akun (UU PDP). Pesan Anda langsung diteruskan ke kotak
            masuk tim kami.
          </p>
        </header>

        <div className="rounded-2xl border border-[#232429] bg-[#151619] p-6 sm:p-8">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
