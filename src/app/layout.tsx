import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "PustakaCari — Riset Jurnal Q1–Q4 & Terjemahan AI",
  description:
    "Ruang riset modern untuk mencari jurnal ilmiah Q1–Q4 & SINTA 1–6, membaca PDF langsung, menerjemahkan otomatis ke Bahasa Indonesia, dan ekspor ke Word (.docx).",
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
  themeColor: "#DB2777",
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-[#18181B] font-sans selection:bg-[#DB2777]/15 selection:text-[#9D174D]">
        {children}
      </body>
    </html>
  );
}
