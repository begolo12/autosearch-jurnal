"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Columns2,
  ExternalLink,
  FileDown,
  FileText,
  Languages,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";
import type { JournalPaper } from "@/lib/types";

interface PdfReaderModalProps {
  paper: JournalPaper;
  initialTranslate?: boolean;
  onClose: () => void;
  onDownloadPdf: (paper: JournalPaper) => Promise<void>;
  onDownloadTranslatedDocx: (paper: JournalPaper) => Promise<void>;
}

type DesktopView = "split" | "pdf" | "translate";
type MobileTab = "pdf" | "translate";

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-[#161513]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function MarkdownView({ content }: { content: string }) {
  const blocks = content.replace(/\r\n/g, "\n").split("\n\n");
  return (
    <div className="space-y-4 text-[15px] leading-[1.75] text-[#2C2A27]">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={i}
              className="font-serif text-xl font-bold leading-snug text-[#161513]"
            >
              {trimmed.slice(2).trim()}
            </h2>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={i}
              className="pt-3 font-serif text-lg font-semibold text-[#154033]"
            >
              {trimmed.slice(3).trim()}
            </h3>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={i}
              className="pt-1.5 font-serif text-base font-semibold text-[#161513]"
            >
              {trimmed.slice(4).trim()}
            </h4>
          );
        }

        const lines = trimmed.split("\n");
        if (lines.every((l) => /^[-*•]\s+/.test(l.trim()))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>
                  {renderInlineMarkdown(l.trim().replace(/^[-*•]\s+/, ""))}
                </li>
              ))}
            </ul>
          );
        }

        return <p key={i}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

export function PdfReaderModal({
  paper,
  initialTranslate = false,
  onClose,
  onDownloadPdf,
  onDownloadTranslatedDocx,
}: PdfReaderModalProps) {
  const [desktopView, setDesktopView] = useState<DesktopView>(
    initialTranslate ? "split" : paper.pdfUrl ? "split" : "translate"
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>(
    initialTranslate || !paper.pdfUrl ? "translate" : "pdf"
  );

  const [translating, setTranslating] = useState(initialTranslate);
  const [translatedMarkdown, setTranslatedMarkdown] = useState<string | null>(
    null
  );
  const [translateModel, setTranslateModel] = useState<string | null>(null);
  const [translateCached, setTranslateCached] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(Boolean(paper.pdfUrl));
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);

  const runTranslate = useCallback(async () => {
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperKey: paper.paperKey,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          venue: paper.venue,
          doi: paper.doi,
          abstract: paper.abstract,
          pdfUrl: paper.pdfUrl,
          language: paper.language,
          scope: "full",
        }),
      });
      const data = (await res.json()) as {
        markdown?: string;
        model?: string;
        cached?: boolean;
        error?: string;
      };

      if (!res.ok || !data.markdown) {
        setTranslateError(
          data.error || "Gagal menerjemahkan jurnal ke Bahasa Indonesia."
        );
        return;
      }

      setTranslatedMarkdown(data.markdown);
      setTranslateModel(data.model || "mv/zai-glm-5-3-flash");
      setTranslateCached(Boolean(data.cached));
    } catch {
      setTranslateError("Gangguan koneksi saat memanggil layanan terjemahan.");
    } finally {
      setTranslating(false);
    }
  }, [paper]);

  useEffect(() => {
    let active = true;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);

    if (initialTranslate) {
      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperKey: paper.paperKey,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          venue: paper.venue,
          doi: paper.doi,
          abstract: paper.abstract,
          pdfUrl: paper.pdfUrl,
          language: paper.language,
          scope: "full",
        }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            markdown?: string;
            model?: string;
            cached?: boolean;
            error?: string;
          };
          if (!active) return;
          if (!res.ok || !data.markdown) {
            setTranslateError(
              data.error || "Gagal menerjemahkan jurnal ke Bahasa Indonesia."
            );
            return;
          }
          setTranslatedMarkdown(data.markdown);
          setTranslateModel(data.model || "mv/zai-glm-5-3-flash");
          setTranslateCached(Boolean(data.cached));
        })
        .catch(() => {
          if (active) {
            setTranslateError(
              "Gangguan koneksi saat memanggil layanan terjemahan."
            );
          }
        })
        .finally(() => {
          if (active) setTranslating(false);
        });
    }

    return () => {
      active = false;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [initialTranslate, onClose, paper]);

  const pdfProxyUrl = paper.pdfUrl
    ? `/api/pdf/view?url=${encodeURIComponent(paper.pdfUrl)}&title=${encodeURIComponent(paper.title)}${paper.doi ? `&doi=${encodeURIComponent(paper.doi)}` : ""}`
    : null;

  useEffect(() => {
    if (!pdfProxyUrl) return;
    let active = true;
    let createdUrl: string | null = null;

    fetch(pdfProxyUrl)
      .then(async (res) => {
        if (!active) return;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!res.ok || !ct.includes("application/pdf")) {
          const errJson = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setPdfLoadError(
            errJson.error ||
              "Penerbit membatasi pratinjau PDF melalui server. Anda tetap bisa membuka PDF langsung di tab baru atau membaca terjemahan AI."
          );
          return;
        }
        const blob = await res.blob();
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(createdUrl);
      })
      .catch(() => {
        if (active) {
          setPdfLoadError(
            "Gagal memuat pratinjau PDF. Silakan buka PDF asli di tab baru."
          );
        }
      })
      .finally(() => {
        if (active) setPdfLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [pdfProxyUrl]);

  const handleDocxClick = async () => {
    setDownloadingDocx(true);
    try {
      await onDownloadTranslatedDocx(paper);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handlePdfClick = async () => {
    setDownloadingPdf(true);
    try {
      await onDownloadPdf(paper);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pembaca Jurnal: ${paper.title}`}
      className="fixed inset-0 z-50 flex flex-col bg-[#F8F7F4]"
    >
      {/* Top Reader Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DFD7] bg-white px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {paper.journalMetrics && (
            <span className="shrink-0 rounded bg-[#154033] px-2 py-0.5 font-mono text-xs font-semibold text-white">
              {paper.journalMetrics.tierLabel} · IF{" "}
              {paper.journalMetrics.impactFactor}
            </span>
          )}
          <h2 className="truncate font-serif text-sm font-semibold text-[#161513] sm:text-base">
            {paper.title}
          </h2>
        </div>

        {/* Desktop view mode switch */}
        <div className="hidden items-center gap-1 border-l border-r border-[#E2DFD7] px-2 lg:flex">
          <button
            type="button"
            onClick={() => setDesktopView("split")}
            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
              desktopView === "split"
                ? "bg-[#154033] text-white"
                : "text-[#57554F] hover:text-[#161513]"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            Berdampingan
          </button>
          <button
            type="button"
            onClick={() => setDesktopView("pdf")}
            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
              desktopView === "pdf"
                ? "bg-[#154033] text-white"
                : "text-[#57554F] hover:text-[#161513]"
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            PDF Penuh
          </button>
          <button
            type="button"
            onClick={() => setDesktopView("translate")}
            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
              desktopView === "translate"
                ? "bg-[#154033] text-white"
                : "text-[#57554F] hover:text-[#161513]"
            }`}
          >
            <Languages className="h-3.5 w-3.5" />
            Terjemahan ID
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {paper.pdfUrl && (
            <button
              type="button"
              disabled={downloadingPdf}
              onClick={() => void handlePdfClick()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#C9C4B8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#161513] hover:border-[#154033] disabled:opacity-60"
            >
              {downloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Unduh PDF</span>
            </button>
          )}

          <button
            type="button"
            disabled={downloadingDocx}
            onClick={() => void handleDocxClick()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#154033] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F2E24] disabled:opacity-60"
          >
            {downloadingDocx ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Unduh .docx (ID)</span>
            <span className="sm:hidden">.docx</span>
          </button>

          <button
            type="button"
            aria-label="Tutup pembaca"
            onClick={onClose}
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-[#E2DFD7] text-[#57554F] hover:border-[#C9C4B8] hover:text-[#161513]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="grid grid-cols-2 border-b border-[#E2DFD7] bg-white lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("pdf")}
          className={`min-h-[42px] border-b-2 text-xs font-semibold ${
            mobileTab === "pdf"
              ? "border-[#154033] text-[#154033]"
              : "border-transparent text-[#57554F]"
          }`}
        >
          PDF Asli
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileTab("translate");
            if (!translatedMarkdown && !translating) {
              void runTranslate();
            }
          }}
          className={`min-h-[42px] border-b-2 text-xs font-semibold ${
            mobileTab === "translate"
              ? "border-[#154033] text-[#154033]"
              : "border-transparent text-[#57554F]"
          }`}
        >
          Terjemahan Indonesia
        </button>
      </div>

      {/* Main Split / Single Content Area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* PDF Viewer Pane */}
        <section
          className={`min-h-0 flex-1 flex-col border-[#E2DFD7] bg-[#EAE7DF] lg:border-r ${
            mobileTab === "pdf" ? "flex" : "hidden lg:flex"
          } ${desktopView === "translate" ? "lg:hidden" : ""}`}
        >
          {pdfProxyUrl ? (
            <div className="relative flex h-full w-full flex-col">
              <div className="flex items-center justify-between border-b border-[#E2DFD7] bg-[#F8F7F4] px-3 py-1.5 text-[11px] text-[#57554F]">
                <span>Pratinjau PDF Langsung</span>
                <a
                  href={paper.pdfUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[#154033] hover:underline"
                >
                  Buka Sumber Asli <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {pdfLoading ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white p-6 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#154033]" />
                  <p className="text-xs font-medium text-[#57554F]">
                    Memuat dokumen PDF dari penerbit...
                  </p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  title={`PDF ${paper.title}`}
                  src={pdfBlobUrl}
                  className="h-full w-full flex-1 bg-white"
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center bg-[#F8F7F4] p-6 text-center">
                  <div className="max-w-md rounded-md border border-[#E2DFD7] bg-white p-6">
                    <AlertCircle className="mx-auto h-6 w-6 text-[#8C3B1A]" />
                    <h3 className="mt-3 font-serif text-base font-semibold text-[#161513]">
                      Pratinjau PDF Dibatasi Penerbit
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#57554F]">
                      {pdfLoadError}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <a
                        href={paper.pdfUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#154033] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F2E24]"
                      >
                        Buka PDF di Tab Baru{" "}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {paper.landingUrl && (
                        <a
                          href={paper.landingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#C9C4B8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#161513] hover:border-[#154033]"
                        >
                          Halaman Penerbit
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMobileTab("translate");
                          setDesktopView("translate");
                          if (!translatedMarkdown && !translating) {
                            void runTranslate();
                          }
                        }}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#C9C4B8] bg-[#F8F7F4] px-3.5 py-1.5 text-xs font-medium text-[#154033] hover:border-[#154033]"
                      >
                        <Languages className="h-3.5 w-3.5" />
                        Baca Terjemahan ID
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <p className="font-serif text-base font-semibold text-[#161513]">
                PDF langsung tidak tersedia dari penerbit
              </p>
              <p className="mt-1 max-w-md text-xs text-[#57554F]">
                Anda tetap dapat membaca terjemahan Bahasa Indonesia di panel
                sebelah, atau membuka halaman penerbit.
              </p>
              {paper.landingUrl && (
                <a
                  href={paper.landingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#154033] px-4 py-2 text-xs font-semibold text-white"
                >
                  Buka Halaman Penerbit <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </section>

        {/* Auto-Translate Pane */}
        <section
          className={`min-h-0 flex-1 flex-col overflow-y-auto bg-[#F8F7F4] ${
            mobileTab === "translate" ? "flex" : "hidden lg:flex"
          } ${desktopView === "pdf" ? "lg:hidden" : ""}`}
        >
          <div className="mx-auto w-full max-w-[70ch] p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#E2DFD7] pb-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#161513]">
                  <Languages className="h-4 w-4 text-[#154033]" />
                  Terjemahan Otomatis ke Bahasa Indonesia
                </div>
                <p className="mt-0.5 text-[11px] text-[#57554F]">
                  Deteksi otomatis bahasa sumber (Inggris, Mandarin, Jepang,
                  Jerman, Arab, dll.)
                </p>
              </div>

              <button
                type="button"
                disabled={translating}
                onClick={() => void runTranslate()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#154033] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F2E24] disabled:opacity-60"
              >
                {translating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Languages className="h-3.5 w-3.5" />
                )}
                {translating
                  ? "Menerjemahkan..."
                  : translatedMarkdown
                    ? "Terjemahkan Ulang"
                    : "Terjemahkan Sekarang"}
              </button>
            </div>

            {translateError && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-[#8C3B1A]/30 bg-[#8C3B1A]/8 p-4 text-sm text-[#8C3B1A]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{translateError}</span>
              </div>
            )}

            {translating && (
              <div className="space-y-3 rounded-md border border-[#E2DFD7] bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-[#154033]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengekstrak teks &amp; menerjemahkan dengan
                  mv/zai-glm-5-3-flash...
                </div>
                <div className="h-4 w-3/4 animate-pulse rounded bg-[#F2EFE9]" />
                <div className="h-4 w-full animate-pulse rounded bg-[#F2EFE9]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#F2EFE9]" />
              </div>
            )}

            {!translating && translatedMarkdown && (
              <article className="rounded-md border border-[#E2DFD7] bg-white p-5 sm:p-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DFD7] pb-3 text-[11px] text-[#78756E]">
                  <span className="font-mono">
                    {translateModel || "mv/zai-glm-5-3-flash"}
                  </span>
                  {translateCached && (
                    <span className="font-medium text-[#154033]">
                      Arsip Cache
                    </span>
                  )}
                </div>
                <MarkdownView content={translatedMarkdown} />
              </article>
            )}

            {!translating && !translatedMarkdown && !translateError && (
              <div className="rounded-md border border-[#E2DFD7] bg-white p-6 text-center">
                <p className="font-serif text-base font-semibold text-[#161513]">
                  Siap Menerjemahkan Jurnal Ini
                </p>
                <p className="mt-1 text-xs text-[#57554F]">
                  Klik tombol &ldquo;Terjemahkan Sekarang&rdquo; di atas untuk
                  membaca isi jurnal dalam Bahasa Indonesia yang rapi.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
