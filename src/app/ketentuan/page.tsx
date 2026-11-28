import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileCheck2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan Layanan — SmartSari",
  description:
    "Syarat dan ketentuan penggunaan platform pencarian dan pengelolaan literatur ilmiah SmartSari.",
};

export default function KetentuanPage() {
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
            <FileCheck2 className="h-3.5 w-3.5" />
            Dokumen Legal
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            Syarat &amp; Ketentuan Layanan
          </h1>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            Terakhir diperbarui: 27 November 2026
          </p>
        </header>

        <div className="space-y-6 rounded-2xl border border-[#232429] bg-[#151619] p-6 text-sm leading-relaxed text-[#D4D4D8] sm:p-8">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              1. Ruang Lingkup Layanan
            </h2>
            <p>
              SmartSari menyediakan platform pencarian literatur ilmiah
              terfilter (termasuk indeks internasional Q1–Q4 dan nasional
              SINTA 1–6), pembacaan dokumen akses terbuka, terjemahan akademik,
              penyusunan matriks literatur, pengelolaan proyek riset, serta
              ekspor sitasi dan dokumen Word (.docx).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              2. Penggunaan yang Diizinkan &amp; Larangan
            </h2>
            <p>
              Anda setuju untuk menggunakan SmartSari secara wajar untuk
              keperluan riset, pembelajaran, dan penulisan akademik. Anda
              dilarang keras untuk:
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-[#A1A1AA]">
              <li>
                Melakukan scraping otomatis, crawling massal, atau membebani
                layanan di luar batas pemakaian wajar (rate limit).
              </li>
              <li>
                Mencoba melewati mekanisme keamanan, otentikasi OTP, proteksi
                anti-bot, atau mengakses data sesi pengguna lain.
              </li>
              <li>
                Menggunakan layanan untuk mendistribusikan ulang karya berhak
                cipta secara komersial tanpa izin pemegang hak.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              3. Integritas Akademik &amp; Penafian (Disclaimer)
            </h2>
            <p>
              Seluruh ringkasan, intisari, terjemahan, maupun matriks literatur
              yang dihasilkan di SmartSari ditujukan sebagai{" "}
              <strong className="text-white">alat bantu riset</strong>. Pengguna
              tetap bertanggung jawab penuh untuk memverifikasi isi, data,
              metodologi, dan ketepatan sitasi terhadap naskah asli penerbit
              sebelum dicantumkan dalam karya ilmiah atau publikasi resmi.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              4. Kekayaan Intelektual Platform
            </h2>
            <p>
              Antarmuka, merek dagang SmartSari, kode sumber aplikasi, tata
              letak, serta perangkat pemformatan dokumen adalah milik SmartSari
              dan dilindungi oleh hukum hak cipta yang berlaku. Untuk informasi
              atribusi pustaka sumber terbuka dan data ilmiah, silakan lihat
              halaman{" "}
              <Link
                href="/lisensi"
                className="font-medium text-[#F472B6] underline-offset-2 hover:underline"
              >
                Lisensi &amp; Atribusi
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              5. Batasan Tanggung Jawab &amp; Kontak
            </h2>
            <p>
              Layanan disediakan &ldquo;sebagaimana adanya&rdquo; sesuai
              ketersediaan indeks sumber eksternal dan akses penerbit. Pertanyaan
              terkait ketentuan layanan dapat dikirimkan melalui{" "}
              <Link
                href="/kontak"
                className="font-medium text-[#F472B6] underline-offset-2 hover:underline"
              >
                Formulir Kontak SmartSari
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
