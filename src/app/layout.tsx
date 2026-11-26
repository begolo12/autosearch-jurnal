import type { Metadata, Viewport } from "next";
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
  title: "PustakaCari — Jurnal Q1 Terverifikasi, Baca PDF & Terjemahan AI",
  description:
    "Cari jurnal ilmiah Q1 terverifikasi, baca PDF langsung di aplikasi, terjemahkan otomatis ke Bahasa Indonesia dari bahasa apa pun, dan konversi ke Word (.docx).",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PustakaCari",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1B4D3E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
