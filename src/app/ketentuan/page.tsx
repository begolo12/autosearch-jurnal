import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan Layanan — SmartSari by AirEvo",
  description:
    "Syarat dan ketentuan penggunaan platform pencarian dan pengelolaan literatur ilmiah SmartSari by AirEvo.",
};

const TOC = [
  { id: "ruang-lingkup", label: "01 Ruang Lingkup" },
  { id: "kuota-unggah", label: "02 Kuota AI & Unggah PDF" },
  { id: "penggunaan-wajar", label: "03 Penggunaan Wajar" },
  { id: "integritas", label: "04 Integritas Akademik" },
  { id: "hak-cipta", label: "05 Kekayaan Intelektual" },
  { id: "tanggung-jawab", label: "06 Batasan & Kontak" },
];

export default function KetentuanPage() {
  return (
    <LegalPageShell
      badgeIcon={<FileCheck2 className="h-3.5 w-3.5" />}
      badgeLabel="Dokumen Legal"
      title="Syarat & Ketentuan Layanan"
      subtitle="Ketentuan penggunaan platform pencarian, pembacaan, dan asistensi riset literatur ilmiah SmartSari by AirEvo."
      metaText="SmartSari by AirEvo · Diperbarui: 28 November 2026"
      toc={TOC}
      currentPath="/ketentuan"
    >
      <div className="space-y-8 rounded-2xl border border-line bg-surface p-6 text-[15px] leading-[1.8] text-ink-body sm:p-10">
        <div className="rounded-xl border border-accent/25 bg-accent/8 p-4 text-xs leading-relaxed text-ink-strong sm:p-5 sm:text-[13px]">
          <strong className="font-semibold text-heading">Ringkasan Utama:</strong>{" "}
          Gunakan SmartSari secara wajar untuk keperluan akademik, jaga keamanan
          akun Anda, dan selalu verifikasi silang setiap ringkasan atau matriks AI
          terhadap naskah asli penerbit sebelum sitasi resmi.
        </div>

        <section id="ruang-lingkup" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              01
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Ruang Lingkup Layanan
            </h2>
          </div>
          <p>
            <strong className="font-semibold text-heading">
              SmartSari by AirEvo
            </strong>{" "}
            menyediakan platform pencarian literatur ilmiah terfilter (mencakup
            indeks internasional Q1–Q4 serta jurnal nasional terakreditasi SINTA
            1–6), pratinjau dokumen akses terbuka, terjemahan akademik ke Bahasa
            Indonesia, penyusunan matriks literatur berbantuan AI, pengelolaan
            proyek riset, serta ekspor sitasi dan dokumen Word (
            <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-accent-soft">
              .docx
            </code>
            ).
          </p>
        </section>

        <hr className="border-line" />

        <section id="kuota-unggah" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              02
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Kuota AI Harian &amp; Unggahan PDF Pribadi
            </h2>
          </div>
          <p>
            Untuk menjaga ketersediaan layanan bagi seluruh peneliti, fitur
            pemrosesan AI (terjemahan naskah, intisari artikel, tanya jawab PDF,
            analisis hasil, dan matriks literatur) dibatasi oleh kuota harian yang
            diperbarui otomatis setiap hari pada pukul 00.00 UTC (pengguna tamu
            mendapatkan batas standar yang lebih ringkas dibandingkan pemilik akun
            terdaftar).
          </p>
          <p className="text-ink-secondary">
            Saat mengunggah berkas PDF pribadi, Anda menyatakan memiliki hak sah
            untuk memproses dokumen tersebut dan tidak mengunggah materi yang
            melanggar hukum atau mengandung perangkat lunak berbahaya.
          </p>
        </section>

        <hr className="border-line" />

        <section id="penggunaan-wajar" className="scroll-mt-8 space-y-3">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              03
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Penggunaan yang Diizinkan &amp; Larangan
            </h2>
          </div>
          <p>
            Anda menyetujui untuk memanfaatkan SmartSari secara etis bagi kegiatan
            penelitian, pembelajaran, dan penulisan ilmiah. Pengguna dilarang
            untuk:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-ink-secondary marker:text-accent-soft">
            <li>
              Melakukan <em>scraping</em> otomatis, <em>crawling</em> massal, atau
              tindakan yang membebani server di luar batas pemakaian wajar (
              <em>rate limit</em>).
            </li>
            <li>
              Berupaya menerobos mekanisme keamanan, autentikasi OTP, verifikasi
              anti-bot Cloudflare Turnstile, ataupun mengakses data sesi pengguna
              lain.
            </li>
            <li>
              Menyebarluaskan ulang naskah berhak cipta untuk tujuan komersial
              tanpa izin resmi pemegang hak atau penerbit terkait.
            </li>
          </ul>
        </section>

        <hr className="border-line" />

        <section id="integritas" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              04
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Integritas Akademik &amp; Batasan Alat Bantu
            </h2>
          </div>
          <p>
            Seluruh ringkasan, terjemahan otomatis, jawaban tanya-jurnal, maupun
            matriks perbandingan yang dihasilkan sistem berfungsi semata-mata
            sebagai <strong className="text-heading">alat bantu riset</strong>.
            Peneliti memegang tanggung jawab akademik penuh untuk memeriksa ulang
            fakta, angka statistik, metodologi, peringkat jurnal, serta format
            sitasi terhadap naskah asli penerbit sebelum menyertakannya dalam
            publikasi ilmiah resmi.
          </p>
        </section>

        <hr className="border-line" />

        <section id="hak-cipta" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              05
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Kekayaan Intelektual Platform
            </h2>
          </div>
          <p>
            Antarmuka, penjenamaan{" "}
            <strong className="font-semibold text-heading">
              SmartSari by AirEvo
            </strong>
            , kode sumber aplikasi, sistem desain, dan modul penyusun dokumen adalah
            milik AirEvo serta dilindungi ketentuan hak cipta yang berlaku. Daftar
            atribusi sumber data ilmiah dan pustaka sumber terbuka tersedia pada
            halaman{" "}
            <Link
              href="/lisensi"
              className="font-medium text-accent-soft underline-offset-4 hover:underline"
            >
              Lisensi &amp; Atribusi
            </Link>
            .
          </p>
        </section>

        <hr className="border-line" />

        <section id="tanggung-jawab" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              06
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Batasan Tanggung Jawab &amp; Bantuan
            </h2>
          </div>
          <p>
            Layanan disediakan sebagaimana adanya sesuai ketersediaan API indeks
            eksternal dan kebijakan akses terbuka penerbit. Pertanyaan hukum,
            laporan kendala, atau permintaan dukungan dapat disampaikan melalui{" "}
            <Link
              href="/kontak"
              className="font-medium text-accent-soft underline-offset-4 hover:underline"
            >
              Formulir Kontak SmartSari
            </Link>
            .
          </p>
        </section>
      </div>
    </LegalPageShell>
  );
}
