import type { Metadata } from "next";
import { Scale } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Lisensi, Hak Cipta & Atribusi — SmartSari by AirEvo",
  description:
    "Informasi kepemilikan SmartSari by AirEvo, lisensi karya ilmiah pihak ketiga, serta atribusi basis data akademik dan perangkat lunak sumber terbuka.",
};

const TOC = [
  { id: "hak-cipta-karya", label: "01 Hak Cipta Karya Ilmiah" },
  { id: "atribusi-data", label: "02 Sumber Data Akademik" },
  { id: "atribusi-oss", label: "03 Perangkat Lunak Terbuka" },
];

const DATA_SOURCES = [
  {
    name: "OpenAlex",
    badge: "CC0 1.0",
    desc: "Data bibliografis global, profil jurnal, metrik sitasi, dan jejaring snowballing lintas literatur.",
  },
  {
    name: "Crossref",
    badge: "Open Metadata API",
    desc: "Registrasi DOI resmi, metadata penerbit, tanggal terbit, serta informasi ISSN terstruktur.",
  },
  {
    name: "Europe PMC",
    badge: "Open Access Archive",
    desc: "Indeks literatur ilmu hayat, biomedis, dan repositori naskah lengkap akses terbuka.",
  },
  {
    name: "Unpaywall",
    badge: "CC0 1.0",
    desc: "Penelusuran legal terhadap lokasi salinan PDF akses terbuka (Open Access) resmi penerbit & repositori.",
  },
];

const OPEN_SOURCE_LIBS = [
  { name: "Next.js", license: "MIT License" },
  { name: "React & React DOM", license: "MIT License" },
  { name: "Tailwind CSS", license: "MIT License" },
  { name: "Drizzle ORM", license: "Apache-2.0 License" },
  { name: "Lucide React", license: "ISC License" },
  { name: "Zod", license: "MIT License" },
  { name: "docx", license: "MIT License" },
  { name: "unpdf", license: "MIT License" },
  { name: "fast-xml-parser", license: "MIT License" },
  { name: "@neondatabase/serverless", license: "MIT License" },
];

export default function LisensiPage() {
  return (
    <LegalPageShell
      badgeIcon={<Scale className="h-3.5 w-3.5" />}
      badgeLabel="Hak Cipta &amp; Kepatuhan Lisensi"
      title="Lisensi, Hak Cipta &amp; Atribusi"
      subtitle="Transparansi kepemilikan SmartSari by AirEvo, penghormatan hak cipta publikasi ilmiah, serta atribusi mitra data dan pustaka terbuka."
      metaText="SmartSari by AirEvo · Diperbarui: 28 November 2026"
      toc={TOC}
      currentPath="/lisensi"
    >
      <div className="space-y-8 rounded-2xl border border-line bg-surface p-6 text-[15px] leading-[1.8] text-ink-body sm:p-10">
        <section id="hak-cipta-karya" className="scroll-mt-8 space-y-3">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              01
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Hak Cipta Karya Ilmiah &amp; Akses Terbuka
            </h2>
          </div>
          <p>
            Platform{" "}
            <strong className="font-semibold text-heading">
              SmartSari diproduksi oleh AirEvo
            </strong>
            . SmartSari by AirEvo tidak mengklaim kepemilikan atas artikel
            ilmiah, abstrak, maupun berkas PDF pihak ketiga yang muncul pada
            hasil pencarian. Seluruh hak cipta karya ilmiah tetap melekat penuh
            pada penulis dan/atau penerbit aslinya.
          </p>
          <p className="text-ink-secondary">
            Pratinjau serta unduhan PDF secara langsung hanya disajikan untuk
            berkas berstatus akses terbuka (<em>Open Access</em>) yang disediakan
            oleh penerbit atau repositori resmi, sedangkan artikel berbayar
            diarahkan ke tautan DOI penerbit. Pengguna wajib mematuhi ketentuan
            lisensi setiap naskah (seperti CC BY atau CC BY-NC) serta menyertakan
            sitasi yang layak.
          </p>
        </section>

        <hr className="border-line" />

        <section id="atribusi-data" className="scroll-mt-8 space-y-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              02
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Atribusi Sumber Data Akademik
            </h2>
          </div>
          <p className="text-ink-secondary">
            SmartSari mengagregasi metadata ilmiah terbuka dan registri ISSN
            jurnal nasional SINTA 1–6 terkurasi dengan dukungan penyedia data
            berikut:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {DATA_SOURCES.map((src) => (
              <div
                key={src.name}
                className="rounded-xl border border-line bg-canvas p-4"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-heading">
                    {src.name}
                  </span>
                  <span className="rounded-md bg-accent/12 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-soft">
                    {src.badge}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-ink-secondary">
                  {src.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-line" />

        <section id="atribusi-oss" className="scroll-mt-8 space-y-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs font-semibold text-accent-soft">
              03
            </span>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-heading">
              Atribusi Perangkat Lunak Sumber Terbuka
            </h2>
          </div>
          <p className="text-ink-secondary">
            Aplikasi SmartSari by AirEvo dibangun di atas komponen perangkat lunak
            sumber terbuka berikut sesuai ketentuan lisensi masing-masing:
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {OPEN_SOURCE_LIBS.map((lib) => (
              <div
                key={lib.name}
                className="flex items-center justify-between rounded-xl border border-line bg-canvas px-4 py-2.5 text-xs"
              >
                <span className="font-medium text-heading">{lib.name}</span>
                <span className="font-mono text-[11px] font-semibold text-accent-soft">
                  {lib.license}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </LegalPageShell>
  );
}
