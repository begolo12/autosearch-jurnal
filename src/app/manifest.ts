import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PustakaCari — Jurnal Q1 & Terjemahan AI",
    short_name: "PustakaCari",
    description:
      "Pencarian jurnal ilmiah Q1 terverifikasi, baca PDF langsung, terjemahan otomatis ke Bahasa Indonesia, dan ekspor ke Word (.docx).",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FAF8F4",
    theme_color: "#1B4D3E",
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
        purpose: "maskable",
      },
    ],
  };
}
