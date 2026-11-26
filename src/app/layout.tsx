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
  metadataBase: new URL("https://smartsari.my.id"),
  title: "SmartSari — Pencarian Jurnal Terfilter & Akurat",
  description:
    "SmartSari: pencarian jurnal ilmiah Q1–Q4 & SINTA 1–6, matriks literatur AI, tanya-jawab PDF, terjemahan Indonesia, dan ekspor Word (.docx).",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "SmartSari — Pencarian Jurnal Terfilter & Akurat",
    description:
      "Cari jurnal Q1–Q4 & SINTA 1–6, susun matriks literatur AI, tanya isi PDF, terjemahkan ke Bahasa Indonesia, dan ekspor ke Word/BibTeX/RIS.",
    url: "https://smartsari.my.id",
    siteName: "SmartSari",
    locale: "id_ID",
    type: "website",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "SmartSari",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "SmartSari — Pencarian Jurnal Terfilter & Akurat",
    description:
      "Pencarian jurnal ilmiah Q1–Q4 & SINTA 1–6 dengan asisten riset AI & ekspor Word.",
    images: ["/icons/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SmartSari",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0F12",
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
      <body className="min-h-full bg-[#0E0F12] text-[#F4F4F5] font-sans">
        {children}
      </body>
    </html>
  );
}
