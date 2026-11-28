import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — SmartSari by AirEvo",
  description:
    "Kebijakan privasi dan pelindungan data pribadi pengguna SmartSari by AirEvo selaras dengan UU PDP No. 27 Tahun 2022.",
};

const TOC = [
  { id: "data-terkumpul", label: "01 Data yang Diproses" },
  { id: "tujuan-keamanan", label: "02 Penggunaan & Keamanan" },
  { id: "hak-pengguna", label: "03 Hak Subjek Data (UU PDP)" },
];

export default function PrivasiPage() {
  return (
    <LegalPageShell
      badgeIcon={<ShieldCheck className="h-3.5 w-3.5" />}
      badgeLabel="Pelindungan Data Pribadi"
      title="Kebijakan Privasi"
      subtitle="Penjelasan transparan mengenai data yang dikumpulkan, diproses, dan dilindungi oleh SmartSari by AirEvo sesuai UU No. 27 Tahun 2022."
      metaText="SmartSari by AirEvo · Diperbarui: 28 November 2026 · Kepatuhan UU PDP"
      toc={TOC}
      currentPath="/privasi"
    >
      <div className="space-y-8 rounded-2xl border border-line bg-surface p-6 text-[15px] leading-[1.8] text-ink-body sm:p-10">
        <div className="rounded-xl border border-ok/30 bg-ok/8 p-4 text-xs leading-relaxed text-ink-strong sm:p-5 sm:text-[13px]">
          <strong className="font-semibold text-heading">Komitmen Privasi AirEvo:</strong>{" "}
          Kami tidak memperjualbelikan data pribadi pengguna, tidak memasang
          pelacak iklan pihak ketiga, serta menyediakan fitur hapus akun permanen
          secara mandiri di dalam aplikasi.
        </div>

        <section id="data-terkumpul" className="scroll-mt-8 space-y-3">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              01
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Data yang Kami Kumpulkan &amp; Proses
            </h2>
          </div>
          <ul className="list-disc space-y-2.5 pl-5 text-ink-secondary marker:text-accent-soft">
            <li>
              <strong className="font-semibold text-heading">
                Informasi Akun (Opsional):
              </strong>{" "}
              Nama lengkap, alamat email, serta hash kata sandi terenkripsi
              apabila Anda memilih mendaftar untuk sinkronisasi proyek riset lintas
              perangkat dan kuota AI 100×/hari.
            </li>
            <li>
              <strong className="font-semibold text-heading">
                Kuki Sesi Fungsional:
              </strong>{" "}
              Kuki sesi{" "}
              <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-accent-soft">
                HttpOnly
              </code>{" "}
              bertanda tangan kriptografis yang semata-mata digunakan untuk
              mengenali sesi kerja, jurnal tersimpan, riwayat pencarian, proyek,
              dan arsip konversi Anda.
            </li>
            <li>
              <strong className="font-semibold text-heading">
                Unggahan PDF Pribadi:
              </strong>{" "}
              Berkas PDF yang Anda unggah diekstrak secara sementara di memori
              server untuk keperluan pembacaan, terjemahan, atau tanya jawab AI
              dan tidak dipublikasikan ke pihak mana pun.
            </li>
            <li>
              <strong className="font-semibold text-heading">
                Penyimpanan Lokal Browser:
              </strong>{" "}
              Cache hasil pencarian, terjemahan, preferensi tema/palet warna, dan
              pengaturan pencarian disimpan secara lokal melalui{" "}
              <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-accent-soft">
                localStorage
              </code>{" "}
              pada perangkat Anda dan dapat dibersihkan kapan saja lewat menu{" "}
              <strong className="text-heading">Pengaturan</strong> atau tombol{" "}
              <em>Bersihkan Cache Lokal</em>.
            </li>
          </ul>
        </section>

        <hr className="border-line" />

        <section id="tujuan-keamanan" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              02
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Tujuan Penggunaan &amp; Keamanan Data
            </h2>
          </div>
          <p>
            Data pengguna digunakan secara terbatas untuk menjalankan fitur riset{" "}
            <strong className="font-semibold text-heading">
              SmartSari by AirEvo
            </strong>
            , menegakkan autentikasi yang aman (verifikasi kode OTP email,
            pencabutan sesi perangkat lain, pembatasan laju permintaan, dan
            verifikasi anti-bot Cloudflare Turnstile), serta menjaga keandalan
            infrastruktur layanan.
          </p>
        </section>

        <hr className="border-line" />

        <section id="hak-pengguna" className="scroll-mt-8 space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              03
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Hak Subjek Data (UU PDP)
            </h2>
          </div>
          <p>
            Selaras dengan Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan
            Data Pribadi, Anda berhak mengakses, memperbarui, maupun menghapus
            data pribadi Anda secara permanen. Perubahan nama, kata sandi, keluar
            dari semua perangkat, hingga penghapusan akun instan tersedia langsung
            pada menu{" "}
            <strong className="text-heading">
              Pengaturan → Akun &amp; Sandi / Data &amp; Privasi
            </strong>
            .
          </p>
          <p className="text-ink-secondary">
            Apabila Anda memerlukan bantuan manual atau verifikasi penghapusan
            data, silakan hubungi tim kami melalui{" "}
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
