import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — SmartSari",
  description:
    "Kebijakan privasi dan perlindungan data pribadi pengguna SmartSari selaras dengan UU PDP No. 27 Tahun 2022.",
};

export default function PrivasiPage() {
  return (
    <div className="min-h-screen bg-[#0E0F12] px-4 py-10 text-[#F4F4F5] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#151619] px-3.5 py-1.5 text-xs font-medium text-[#D4D4D8] transition-colors hover:border-[#F472B6]/45 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-[#F472B6]" />
          Kembali ke SmartSari
        </Link>

        <header className="mb-8 border-b border-[#232429] pb-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#DB2777]/30 bg-[#DB2777]/10 px-3 py-1 text-xs font-medium text-[#F9A8D4]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Perlindungan Data Pribadi
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            Kebijakan Privasi
          </h1>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            Terakhir diperbarui: 27 November 2026 · Selaras dengan UU No. 27
            Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)
          </p>
        </header>

        <div className="space-y-6 rounded-2xl border border-[#232429] bg-[#151619] p-6 text-sm leading-relaxed text-[#D4D4D8] sm:p-8">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              1. Data yang Kami Kumpulkan
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-[#A1A1AA]">
              <li>
                <strong className="text-[#E4E4E7]">Data Akun (Opsional):</strong>{" "}
                Nama lengkap, alamat email, dan kata sandi terenkripsi jika Anda
                mendaftar untuk sinkronisasi lintas perangkat.
              </li>
              <li>
                <strong className="text-[#E4E4E7]">Sesi Fungsional:</strong>{" "}
                Cookie sesi <code className="text-[#F9A8D4]">HttpOnly</code>{" "}
                yang hanya digunakan untuk menyimpan jurnal tersimpan, proyek
                riset, riwayat pencarian, dan arsip dokumen Anda.
              </li>
              <li>
                <strong className="text-[#E4E4E7]">
                  Penyimpanan Lokal Browser:
                </strong>{" "}
                Cache pencarian, terjemahan, dan preferensi antarmuka disimpan
                secara lokal di <code className="text-[#F9A8D4]">localStorage</code>{" "}
                perangkat Anda dan dapat dihapus kapan saja melalui tombol
                &ldquo;Bersihkan Cache Lokal&rdquo; di sidebar.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              2. Penggunaan &amp; Keamanan Data
            </h2>
            <p>
              Data Anda digunakan semata-mata untuk mengoperasikan fitur riset
              SmartSari, menjaga keamanan otentikasi (verifikasi OTP &amp;
              pembatasan laju permintaan), serta menyinkronkan ruang kerja Anda.
              Kami <strong className="text-white">tidak menjual</strong> data
              pribadi pengguna dan{" "}
              <strong className="text-white">tidak memasang</strong> pelacak
              iklan pihak ketiga.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              3. Hak Pengguna atas Data
            </h2>
            <p>
              Anda berhak untuk mengakses, memperbarui, atau meminta penghapusan
              data akun maupun riwayat riset Anda. Anda dapat menghapus riwayat
              pencarian, jurnal tersimpan, proyek, serta arsip Word secara
              langsung di aplikasi, atau menghubungi kami melalui{" "}
              <Link
                href="/kontak"
                className="font-medium text-[#F472B6] underline-offset-2 hover:underline"
              >
                Formulir Kontak SmartSari
              </Link>{" "}
              untuk permintaan penghapusan akun permanen.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
