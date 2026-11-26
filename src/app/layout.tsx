import type { Metadata } from "next";
import {
  JetBrains_Mono,
  Source_Sans_3,
  Source_Serif_4,
} from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PustakaCari — Pencarian Jurnal Otomatis & Konversi Word AI",
  description:
    "Cari jurnal ilmiah open-access dari OpenAlex, arXiv, Europe PMC, dan DOAJ, unduh PDF langsung, serta konversi ke Microsoft Word (.docx) dengan mv/zai-glm-5-3-flash.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${sourceSans.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#FAF8F4] text-[#1C1917] font-sans selection:bg-[#1B4D3E]/15 selection:text-[#1B4D3E]">
        {children}
      </body>
    </html>
  );
}
