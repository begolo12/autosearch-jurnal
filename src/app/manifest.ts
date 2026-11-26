import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PustakaCari — Riset Jurnal Q1–Q4 & Terjemahan AI",
    short_name: "PustakaCari",
    description:
      "Ruang riset modern untuk mencari jurnal ilmiah Q1–Q4 & SINTA 1–6, baca PDF langsung, terjemahan otomatis ke Bahasa Indonesia, dan ekspor Word (.docx).",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FFF8FA",
    theme_color: "#DB2777",
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
