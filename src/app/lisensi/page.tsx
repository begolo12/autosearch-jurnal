import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";

export const metadata: Metadata = {
  title: "Lisensi, Hak Cipta & Atribusi — SmartSari",
  description:
    "Informasi hak cipta platform SmartSari, lisensi karya ilmiah pihak ketiga, serta atribusi sumber data dan perangkat lunak sumber terbuka.",
};

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
            <Scale className="h-3.5 w-3.5" />
            Hak Cipta &amp; Kepatuhan Lisensi
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            Lisensi, Hak Cipta &amp; Atribusi
          </h1>
          <p className="mt-2 text-xs text-[#A1A1AA]">
            &copy; 2026 SmartSari. Seluruh hak cipta dilindungi.
          </p>
        </header>

        <div className="space-y-6 rounded-2xl border border-[#232429] bg-[#151619] p-6 text-sm leading-relaxed text-[#D4D4D8] sm:p-8">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              1. Hak Cipta Karya Ilmiah &amp; Akses Terbuka
            </h2>
            <p>
              SmartSari tidak mengklaim kepemilikan atas artikel ilmiah,
              abstrak, maupun berkas PDF pihak ketiga yang ditampilkan melalui
              hasil pencarian. Seluruh hak cipta karya ilmiah tetap berada pada
              penulis dan/atau penerbit masing-masing.
            </p>
            <p className="text-[#A1A1AA]">
              Pratinjau dan unduhan PDF hanya dilakukan untuk berkas akses
              terbuka (Open Access) yang diizinkan oleh penerbit, sementara
              artikel non-terbuka diarahkan ke halaman resmi penerbit (DOI).
              Pengguna wajib mematuhi ketentuan lisensi masing-masing artikel
              (seperti CC BY, CC BY-NC, atau hak cipta penerbit) serta
              mencantumkan sitasi yang semestinya.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-white">
              2. Atribusi Sumber Data Akademik
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-[#A1A1AA]">
              <li>
                <strong className="text-[#E4E4E7]">OpenAlex:</strong> Data
                bibliografis dan jejaring sitasi disediakan di bawah lisensi CC0
                1.0 Universal Public Domain Dedication.
              </li>
              <li>
                <strong className="text-[#E4E4E7]">Crossref:</strong> Metadata
                DOI dan informasi publikasi jurnal melalui API metadata terbuka
                Crossref.
              </li>
              <li>
                <strong className="text-[#E4E4E7]">Europe PMC:</strong> Indeks
                literatur biomedis dan teks lengkap akses terbuka.
              </li>
              <li>
                <strong className="text-[#E4E4E7]">Unpaywall:</strong> Indeks
                tautan versi akses terbuka resmi (CC0).
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-white">
              3. Atribusi Perangkat Lunak Sumber Terbuka
            </h2>
            <p className="text-[#A1A1AA]">
              Platform SmartSari dibangun menggunakan pustaka perangkat lunak
              sumber terbuka berikut sesuai ketentuan lisensi masing-masing:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPEN_SOURCE_LIBS.map((lib) => (
                <div
                  key={lib.name}
                  className="flex items-center justify-between rounded-xl border border-[#232429] bg-[#0E0F12] px-3.5 py-2 text-xs"
                >
                  <span className="font-medium text-white">{lib.name}</span>
                  <span className="font-mono text-[11px] text-[#F472B6]">
                    {lib.license}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
