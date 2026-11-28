import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { ThemeSync } from "@/components/ThemeSync";
import { APPEARANCE_INIT_SCRIPT } from "@/lib/appearance";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://smartsari.my.id"),
  title: "SmartSari by AirEvo — Pencarian Jurnal Terfilter & Akurat",
  description:
    "SmartSari by AirEvo: platform pencarian jurnal ilmiah Q1–Q4 & SINTA 1–6, matriks literatur AI, pembacaan PDF, terjemahan Indonesia, dan ekspor Word (.docx).",
  creator: "AirEvo",
  publisher: "AirEvo",
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
      data-theme="dark"
      data-palette="rose"
      suppressHydrationWarning
      className={`${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full bg-canvas text-ink font-sans">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
