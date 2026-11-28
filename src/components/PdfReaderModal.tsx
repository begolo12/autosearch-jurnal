"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Columns2,
  Copy,
  ExternalLink,
  FileDown,
  FileText,
  Languages,
  Loader2,
  Maximize2,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  getCachedFullTranslation,
  getCachedPaperChat,
  notifyQuotaUpdated,
  setCachedFullTranslation,
  setCachedPaperChat,
} from "@/lib/local-cache";
import type { JournalPaper, PaperChatMessage } from "@/lib/types";
import { getSafeHttpUrl } from "@/lib/url";

interface PdfReaderModalProps {
  paper: JournalPaper;
  initialTranslate?: boolean;
  initialDesktopView?: DesktopView;
  initialMobileTab?: MobileTab;
  onViewChange?: (view: {
    desktopView: DesktopView;
    mobileTab: MobileTab;
  }) => void;
  onClose: () => void;
  onDownloadPdf: (paper: JournalPaper) => Promise<void>;
  onDownloadTranslatedDocx: (paper: JournalPaper) => Promise<void>;
}

type DesktopView = "split" | "pdf" | "translate" | "chat";
type MobileTab = "pdf" | "translate" | "chat";

const CHAT_STARTER_PROMPTS = [
  "Apa metode penelitian & desain studi yang digunakan?",
  "Apa temuan utama dan kontribusi jurnal ini?",
  "Apa keterbatasan penelitian dan saran riset lanjutan?",
  "Buatkan 1 paragraf sitasi siap pakai untuk Bab 2 Tinjauan Pustaka (APA)",
];

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-semibold text-heading">
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

function MarkdownView({
  content,
  fontSize = "md",
}: {
  content: string;
  fontSize?: "sm" | "md" | "lg";
}) {
  const blocks = content.replace(/\r\n/g, "\n").split("\n\n");
  const sizeClass =
    fontSize === "sm"
      ? "text-[14px] leading-[1.7]"
      : fontSize === "lg"
        ? "text-[17px] leading-[1.8]"
        : "text-[15px] leading-[1.75]";
  return (
    <div className={`space-y-4 text-ink-strong ${sizeClass}`}>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={i}
              className="text-xl font-bold leading-snug tracking-[-0.015em] text-heading"
            >
              {trimmed.slice(2).trim()}
            </h2>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={i}
              className="border-b border-line/80 pb-1.5 pt-3 text-lg font-semibold text-accent-soft"
            >
              {trimmed.slice(3).trim()}
            </h3>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={i}
              className="pt-1.5 text-base font-semibold text-ink"
            >
              {trimmed.slice(4).trim()}
            </h4>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote
              key={i}
              className="rounded-r-xl border-l-2 border-accent bg-canvas/70 px-4 py-2.5 text-sm italic text-ink-body"
            >
              {renderInlineMarkdown(
                trimmed
                  .split("\n")
                  .map((l) => l.replace(/^>\s?/, ""))
                  .join(" ")
              )}
            </blockquote>
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
        if (lines.every((l) => /^\d+\.\s+/.test(l.trim()))) {
          return (
            <ol key={i} className="list-decimal space-y-1.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>
                  {renderInlineMarkdown(l.trim().replace(/^\d+\.\s+/, ""))}
                </li>
              ))}
            </ol>
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
  initialDesktopView,
  initialMobileTab,
  onViewChange,
  onClose,
  onDownloadPdf,
  onDownloadTranslatedDocx,
}: PdfReaderModalProps) {
  const hasPdf = Boolean(paper.pdfUrl || paper.localPdfUrl);
  const [desktopView, setDesktopView] = useState<DesktopView>(
    initialDesktopView ??
      (initialTranslate ? "split" : hasPdf ? "split" : "translate")
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>(
    initialMobileTab ??
      (initialTranslate || !hasPdf ? "translate" : "pdf")
  );

  useEffect(() => {
    onViewChange?.({ desktopView, mobileTab });
  }, [desktopView, mobileTab, onViewChange]);

  const [translating, setTranslating] = useState(initialTranslate);
  const [translatedMarkdown, setTranslatedMarkdown] = useState<string | null>(
    null
  );
  const [translateCached, setTranslateCached] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(
    Boolean(paper.pdfUrl && !paper.localPdfUrl)
  );
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(
    paper.localPdfUrl ?? null
  );
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<PaperChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUsedFullText, setChatUsedFullText] = useState<boolean | null>(null);
  const [copiedChatIdx, setCopiedChatIdx] = useState<number | null>(null);
  const [copiedFullTranslation, setCopiedFullTranslation] = useState(false);
  const [readerFontSize, setReaderFontSize] = useState<"sm" | "md" | "lg">(
    "md"
  );
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(
          "smartsari:v1:reader_font_size"
        );
        if (saved === "sm" || saved === "md" || saved === "lg") {
          setReaderFontSize(saved);
        }
      } catch {
        // Ignore storage errors
      }
    });
  }, []);

  const changeFontSize = (next: "sm" | "md" | "lg") => {
    setReaderFontSize(next);
    try {
      window.localStorage.setItem("smartsari:v1:reader_font_size", next);
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages.length, chatLoading]);

  const sendChatMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || chatLoading) return;

      const nextMessages: PaperChatMessage[] = [
        ...chatMessages,
        { role: "user", content: trimmed },
      ];
      setChatMessages(nextMessages);
      setChatInput("");
      setChatLoading(true);
      setChatError(null);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paper: {
              title: paper.title,
              authors: paper.authors,
              year: paper.year,
              venue: paper.venue,
              doi: paper.doi,
              abstract: paper.abstract,
              pdfUrl: paper.pdfUrl,
              customText: paper.customText ?? undefined,
            },
            messages: nextMessages,
          }),
        });
        const data = (await res.json()) as {
          reply?: string;
          usedFullText?: boolean;
          error?: string;
        };
        if (!res.ok || !data.reply) {
          setChatError(data.error || "Gagal mendapatkan jawaban AI.");
          return;
        }
        const fullTextFlag = Boolean(data.usedFullText);
        setChatUsedFullText(fullTextFlag);
        const updatedMessages: PaperChatMessage[] = [
          ...nextMessages,
          { role: "assistant", content: data.reply! },
        ];
        setChatMessages(updatedMessages);
        setCachedPaperChat(paper.paperKey, {
          messages: updatedMessages,
          usedFullText: fullTextFlag,
        });
      } catch {
        setChatError("Gangguan koneksi saat menghubungi asisten AI.");
      } finally {
        setChatLoading(false);
        notifyQuotaUpdated();
      }
    },
    [chatLoading, chatMessages, paper]
  );

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
          customText: paper.customText ?? undefined,
          language: paper.language,
          scope: "full",
        }),
      });
      const data = (await res.json()) as {
        markdown?: string;
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
      setTranslateCached(Boolean(data.cached));
      setCachedFullTranslation(paper.paperKey, {
        markdown: data.markdown,
      });
    } catch {
      setTranslateError("Gangguan koneksi saat memanggil layanan terjemahan.");
    } finally {
      setTranslating(false);
      notifyQuotaUpdated();
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

    queueMicrotask(() => {
      if (!active) return;
      const cachedChat = getCachedPaperChat(paper.paperKey);
      if (cachedChat) {
        setChatMessages(cachedChat.messages);
        setChatUsedFullText(cachedChat.usedFullText);
      }

      const cachedTrans = getCachedFullTranslation(paper.paperKey);
      if (cachedTrans) {
        setTranslatedMarkdown(cachedTrans.markdown);
        setTranslateCached(true);
        setTranslating(false);
      }
    });
    if (!getCachedFullTranslation(paper.paperKey) && initialTranslate) {
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
          customText: paper.customText ?? undefined,
          language: paper.language,
          scope: "full",
        }),
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            markdown?: string;
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
          setTranslateCached(Boolean(data.cached));
          setCachedFullTranslation(paper.paperKey, {
            markdown: data.markdown,
          });
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
          notifyQuotaUpdated();
        });
    }

    return () => {
      active = false;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [initialTranslate, onClose, paper]);

  const pdfProxyUrl =
    paper.pdfUrl && !paper.localPdfUrl
      ? `/api/pdf/view?url=${encodeURIComponent(paper.pdfUrl)}&title=${encodeURIComponent(paper.title)}${paper.doi ? `&doi=${encodeURIComponent(paper.doi)}` : ""}`
      : null;

  useEffect(() => {
    if (paper.localPdfUrl) {
      return;
    }
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
  }, [pdfProxyUrl, paper.localPdfUrl]);

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
      className="animate-modal-in fixed inset-0 z-50 flex flex-col bg-canvas"
    >
      {/* Top Reader Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 py-2.5 shadow-sm backdrop-blur-md sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {paper.journalMetrics && (
            <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 font-mono text-xs font-semibold text-white shadow-[0_0_10px_rgba(var(--accent-rgb),0.28)]">
              {paper.journalMetrics.tierLabel} · IF{" "}
              {paper.journalMetrics.impactFactor}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink sm:text-base">
              {paper.title}
            </h2>
            {(paper.authors.length > 0 || paper.venue || paper.year) && (
              <p className="truncate text-[11px] text-ink-secondary">
                {[
                  paper.authors.length > 0
                    ? paper.authors.slice(0, 2).join(", ") +
                      (paper.authors.length > 2 ? " dkk." : "")
                    : null,
                  paper.venue,
                  paper.year ? String(paper.year) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>

        {/* Desktop view mode switch */}
        <div className="hidden items-center gap-1 rounded-lg border border-line-strong bg-canvas p-0.5 lg:flex">
          {hasPdf && (
            <>
              <button
                type="button"
                onClick={() => setDesktopView("split")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                  desktopView === "split"
                    ? "bg-accent text-white"
                    : "text-ink-secondary hover:text-heading"
                }`}
              >
                <Columns2 className="h-3.5 w-3.5" />
                Berdampingan
              </button>
              <button
                type="button"
                onClick={() => setDesktopView("pdf")}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                  desktopView === "pdf"
                    ? "bg-accent text-white"
                    : "text-ink-secondary hover:text-heading"
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                PDF Penuh
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setDesktopView("translate")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
              desktopView === "translate"
                ? "bg-accent text-white"
                : "text-ink-secondary hover:text-heading"
            }`}
          >
            <Languages className="h-3.5 w-3.5" />
            Terjemahan ID
          </button>
          <button
            type="button"
            onClick={() => setDesktopView("chat")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
              desktopView === "chat"
                ? "bg-accent text-white"
                : "text-ink-secondary hover:text-heading"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Tanya Jurnal
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {paper.pdfUrl && (
            <button
              type="button"
              disabled={downloadingPdf}
              onClick={() => void handlePdfClick()}
              className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent disabled:opacity-60"
            >
              {downloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-soft" />
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
            className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
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
            className="btn-tactile inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-line-strong text-ink-secondary hover:border-line-hover hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div
        className={`grid border-b border-line bg-surface lg:hidden ${
          hasPdf ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        {hasPdf && (
          <button
            type="button"
            onClick={() => setMobileTab("pdf")}
            className={`min-h-[42px] border-b-2 text-xs font-semibold ${
              mobileTab === "pdf"
                ? "border-accent text-accent-soft"
                : "border-transparent text-ink-secondary"
            }`}
          >
            PDF Asli
          </button>
        )}
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
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          Terjemahan
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`min-h-[42px] border-b-2 text-xs font-semibold ${
            mobileTab === "chat"
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          Tanya Jurnal
        </button>
      </div>

      {/* Main Split / Single Content Area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* PDF Viewer Pane */}
        <section
          className={`min-h-0 flex-1 flex-col border-line bg-surface lg:border-r ${
            mobileTab === "pdf" ? "flex" : "hidden lg:flex"
          } ${desktopView === "translate" || desktopView === "chat" ? "lg:hidden" : ""}`}
        >
          {(pdfProxyUrl || paper.localPdfUrl) ? (
            <div className="relative flex h-full w-full flex-col">
              <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-1.5 text-[11px] text-ink-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      pdfBlobUrl
                        ? "bg-ok"
                        : pdfLoading
                          ? "animate-pulse bg-warn"
                          : "bg-danger"
                    }`}
                  />
                  {paper.localPdfUrl ? "PDF Unggahan Pribadi" : "Pratinjau PDF Langsung"}
                </span>
                {getSafeHttpUrl(paper.pdfUrl) && (
                  <a
                    href={getSafeHttpUrl(paper.pdfUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-accent-soft hover:underline"
                  >
                    Buka Sumber Asli <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {pdfLoading ? (
                <div className="flex flex-1 flex-col items-center justify-center bg-canvas p-6">
                  <div className="w-full max-w-md space-y-4 rounded-xl border border-line bg-surface p-6 shadow-xl">
                    <div className="flex items-center gap-2 text-xs font-medium text-accent-soft">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memuat dokumen PDF dari penerbit...</span>
                    </div>
                    <div className="space-y-2.5 border-t border-line pt-4">
                      <div className="h-4 w-4/5 animate-pulse rounded bg-line" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-elevated" />
                      <div className="mt-4 h-24 w-full animate-pulse rounded-lg bg-elevated" />
                      <div className="h-3 w-full animate-pulse rounded bg-line" />
                      <div className="h-3 w-11/12 animate-pulse rounded bg-line" />
                      <div className="h-3 w-3/4 animate-pulse rounded bg-elevated" />
                    </div>
                  </div>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  title={`PDF ${paper.title}`}
                  src={pdfBlobUrl}
                  className="h-full w-full flex-1 bg-white"
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center bg-canvas p-6 text-center">
                  <div className="max-w-md rounded-xl border border-line-strong bg-surface p-6">
                    <AlertCircle className="mx-auto h-6 w-6 text-danger" />
                    <h3 className="mt-3 text-base font-semibold text-heading">
                      Pratinjau PDF Dibatasi Penerbit
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                      {pdfLoadError}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      {getSafeHttpUrl(paper.pdfUrl) && (
                        <a
                          href={getSafeHttpUrl(paper.pdfUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
                        >
                          Buka PDF di Tab Baru{" "}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {getSafeHttpUrl(paper.landingUrl) && (
                        <a
                          href={getSafeHttpUrl(paper.landingUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-1.5 text-xs font-medium text-ink-strong hover:border-accent"
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
                        className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-accent/35 bg-accent/15 px-3.5 py-1.5 text-xs font-medium text-accent-tint hover:border-accent-soft"
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
              <p className="text-base font-semibold text-heading">
                PDF langsung tidak tersedia dari penerbit
              </p>
              <p className="mt-1 max-w-md text-xs text-ink-secondary">
                Anda tetap dapat membaca terjemahan Bahasa Indonesia di panel
                sebelah, atau membuka halaman penerbit.
              </p>
              {getSafeHttpUrl(paper.landingUrl) && (
                <a
                  href={getSafeHttpUrl(paper.landingUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tactile mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover"
                >
                  Buka Halaman Penerbit <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </section>

        {/* Auto-Translate Pane */}
        <section
          className={`min-h-0 flex-1 flex-col overflow-y-auto bg-canvas ${
            mobileTab === "translate" ? "flex" : "hidden lg:flex"
          } ${desktopView === "pdf" || desktopView === "chat" ? "lg:hidden" : ""}`}
        >
          <div className="mx-auto w-full max-w-[70ch] p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-heading">
                  <Languages className="h-4 w-4 text-accent-soft" />
                  Terjemahan Otomatis ke Bahasa Indonesia
                </div>
                <p className="mt-0.5 text-[11px] text-ink-secondary">
                  Deteksi otomatis bahasa sumber (Inggris, Mandarin, Jepang,
                  Jerman, Arab, dll.)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="inline-flex items-center rounded-full border border-line-strong bg-surface p-0.5 text-[11px]"
                  role="group"
                  aria-label="Ukuran huruf bacaan"
                >
                  {(
                    [
                      { id: "sm", label: "A-" },
                      { id: "md", label: "A" },
                      { id: "lg", label: "A+" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => changeFontSize(opt.id)}
                      className={`rounded-full px-2 py-0.5 font-medium transition-colors ${
                        readerFontSize === opt.id
                          ? "bg-accent text-white"
                          : "text-ink-secondary hover:text-heading"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={translating}
                  onClick={() => void runTranslate()}
                  className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
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
            </div>

            {translateError && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/35 bg-danger/10 p-4 text-sm text-danger-soft">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{translateError}</span>
              </div>
            )}

            {translating && (
              <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-accent-soft">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengekstrak teks &amp; menerjemahkan dengan SmartSari...
                </div>
                <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
                <div className="h-4 w-full animate-pulse rounded bg-line" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-line" />
              </div>
            )}

            {!translating && translatedMarkdown && (() => {
              const wordCount = translatedMarkdown
                .trim()
                .split(/\s+/)
                .filter(Boolean).length;
              const readMinutes = Math.max(1, Math.round(wordCount / 200));
              return (
              <article className="rounded-xl border border-line bg-surface p-5 sm:p-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-[11px] text-ink-muted">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-secondary">
                      SmartSari by AirEvo
                    </span>
                    <span className="text-ink-faint">·</span>
                    <span>
                      ~{readMinutes} mnt baca ·{" "}
                      {wordCount.toLocaleString("id-ID")} kata
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {translateCached && (
                      <span className="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent-soft">
                        Arsip Cache
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(translatedMarkdown)
                          .then(() => {
                            setCopiedFullTranslation(true);
                            setTimeout(
                              () => setCopiedFullTranslation(false),
                              1800
                            );
                          })
                          .catch(() => {});
                      }}
                      className="inline-flex items-center gap-1 rounded border border-line-strong bg-elevated px-2 py-0.5 font-medium text-ink-body transition-colors hover:border-accent-soft/45 hover:text-heading"
                    >
                      {copiedFullTranslation ? (
                        <>
                          <Check className="h-3 w-3 text-ok" />
                          <span className="text-ok">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Salin teks</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <MarkdownView
                  content={translatedMarkdown}
                  fontSize={readerFontSize}
                />
              </article>
              );
            })()}

            {!translating && !translatedMarkdown && !translateError && (
              <div className="rounded-xl border border-line bg-surface p-6 text-center">
                <p className="text-base font-semibold text-heading">
                  Siap Menerjemahkan Jurnal Ini
                </p>
                <p className="mt-1 text-xs text-ink-secondary">
                  Klik tombol &ldquo;Terjemahkan Sekarang&rdquo; di atas untuk
                  membaca isi jurnal dalam Bahasa Indonesia yang rapi.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Tanya AI (Chat with PDF / Paper) Pane */}
        <section
          className={`min-h-0 flex-1 flex-col bg-canvas ${
            mobileTab === "chat"
              ? "flex"
              : desktopView === "chat"
                ? "hidden lg:flex"
                : "hidden"
          }`}
        >
          <div className="mx-auto flex h-full w-full max-w-[74ch] flex-col p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-soft">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-heading">
                    Tanya Jurnal Ini
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    {chatUsedFullText === true
                      ? "Konteks: teks lengkap PDF"
                      : paper.pdfUrl
                        ? "Konteks: PDF penuh / abstrak otomatis"
                        : "Konteks: metadata & abstrak"}
                  </p>
                </div>
              </div>
              {chatMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setChatMessages([]);
                    setChatError(null);
                    setCachedPaperChat(paper.paperKey, {
                      messages: [],
                      usedFullText: chatUsedFullText,
                    });
                  }}
                  className="rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-accent-soft/45 hover:text-heading"
                >
                  Reset chat
                </button>
              )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {chatMessages.length === 0 && (
                <div className="rounded-xl border border-line bg-surface p-5">
                  <p className="text-xs font-medium text-ink-body">
                    Ajukan pertanyaan apa saja tentang metode, temuan, sampel,
                    atau keterbatasan jurnal ini:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CHAT_STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendChatMessage(prompt)}
                        className="btn-tactile rounded-full border border-line-strong bg-elevated px-3 py-1.5 text-left text-xs text-ink-strong hover:border-accent-soft/45 hover:text-heading"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-accent text-white shadow-sm"
                        : "border border-line bg-surface text-ink-strong"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-75">
                      {msg.role === "assistant" ? (
                        <>
                          <Sparkles className="h-3 w-3 text-accent-soft" />
                          <span className="text-accent-tint">SmartSari</span>
                        </>
                      ) : (
                        <span>Anda</span>
                      )}
                    </div>
                    {msg.role === "assistant" ? (
                      <MarkdownView content={msg.content} fontSize="sm" />
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    {msg.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(msg.content);
                          setCopiedChatIdx(idx);
                          setTimeout(() => setCopiedChatIdx(null), 1500);
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-secondary hover:text-accent-soft"
                      >
                        {copiedChatIdx === idx ? (
                          <>
                            <Check className="h-3 w-3 text-ok" />
                            Tersalin
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Salin jawaban
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-accent-soft">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Membaca isi jurnal &amp; menyusun jawaban...
                </div>
              )}

              {chatError && (
                <div className="flex items-center gap-2 rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-xs text-danger-soft">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChatMessage(chatInput);
              }}
              className="mt-3 flex items-center gap-2 rounded-full border border-line-strong bg-surface p-1.5 pl-4 focus-within:border-accent-soft"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Tanyakan metode, hasil, atau rincian isi jurnal..."
                className="min-w-0 flex-1 bg-transparent text-sm text-heading placeholder:text-ink-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="btn-tactile inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                aria-label="Kirim pertanyaan"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
