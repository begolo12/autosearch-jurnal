import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SmartSari — Pencarian Jurnal Terfilter & Akurat",
    short_name: "SmartSari",
    description:
      "Pencarian jurnal ilmiah terfilter (Q1–Q4 & SINTA 1–6), unggah & baca PDF langsung, terjemahan otomatis ke Bahasa Indonesia, dan ekspor Word (.docx).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    prefer_related_applications: false,
    background_color: "#0E0F12",
    theme_color: "#0E0F12",
    lang: "id",
    categories: ["education", "books", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Cari Jurnal Q1",
        short_name: "Cari Q1",
        description: "Buka pencarian jurnal bereputasi Q1",
        url: "/?tier=q1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Jurnal Tersimpan",
        short_name: "Bookmark",
        description: "Lihat daftar jurnal tersimpan & proyek riset",
        url: "/?tab=bookmarks",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Kontak & Bantuan",
        short_name: "Kontak",
        description: "Hubungi tim SmartSari",
        url: "/kontak",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
