"use client";

import { useCallback, useEffect, useState } from "react";
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
  setCachedFullTranslation,
  setCachedPaperChat,
} from "@/lib/local-cache";
import type { JournalPaper, PaperChatMessage } from "@/lib/types";

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
        <strong key={idx} className="font-semibold text-white">
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
    <div className="space-y-4 text-[15px] leading-[1.75] text-[#E4E4E7]">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("# ")) {
          return (
            <h2
              key={i}
              className="text-xl font-bold leading-snug tracking-[-0.015em] text-white"
            >
              {trimmed.slice(2).trim()}
            </h2>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3
              key={i}
              className="pt-3 text-lg font-semibold text-[#F472B6]"
            >
              {trimmed.slice(3).trim()}
            </h3>
          );
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h4
              key={i}
              className="pt-1.5 text-base font-semibold text-[#F4F4F5]"
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
  initialDesktopView,
  initialMobileTab,
  onViewChange,
  onClose,
  onDownloadPdf,
  onDownloadTranslatedDocx,
}: PdfReaderModalProps) {
  const [desktopView, setDesktopView] = useState<DesktopView>(
    initialDesktopView ??
      (initialTranslate ? "split" : paper.pdfUrl ? "split" : "translate")
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>(
    initialMobileTab ??
      (initialTranslate || !paper.pdfUrl ? "translate" : "pdf")
  );

  useEffect(() => {
    onViewChange?.({ desktopView, mobileTab });
  }, [desktopView, mobileTab, onViewChange]);

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

  const [chatMessages, setChatMessages] = useState<PaperChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatUsedFullText, setChatUsedFullText] = useState<boolean | null>(null);
  const [copiedChatIdx, setCopiedChatIdx] = useState<number | null>(null);

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

      const usedModel = data.model || "mv/zai-glm-5-3-flash";
      setTranslatedMarkdown(data.markdown);
      setTranslateModel(usedModel);
      setTranslateCached(Boolean(data.cached));
      setCachedFullTranslation(paper.paperKey, {
        markdown: data.markdown,
        model: usedModel,
      });
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

    const cachedChat = getCachedPaperChat(paper.paperKey);
    if (cachedChat) {
      setChatMessages(cachedChat.messages);
      setChatUsedFullText(cachedChat.usedFullText);
    }

    const cachedTrans = getCachedFullTranslation(paper.paperKey);
    if (cachedTrans) {
      setTranslatedMarkdown(cachedTrans.markdown);
      setTranslateModel(cachedTrans.model);
      setTranslateCached(true);
      setTranslating(false);
    } else if (initialTranslate) {
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
          const usedModel = data.model || "mv/zai-glm-5-3-flash";
          setTranslatedMarkdown(data.markdown);
          setTranslateModel(usedModel);
          setTranslateCached(Boolean(data.cached));
          setCachedFullTranslation(paper.paperKey, {
            markdown: data.markdown,
            model: usedModel,
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
      className="animate-modal-in fixed inset-0 z-50 flex flex-col bg-[#0E0F12]"
    >
      {/* Top Reader Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#232429] bg-[#151619] px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {paper.journalMetrics && (
            <span className="shrink-0 rounded-md bg-[#DB2777] px-2 py-0.5 font-mono text-xs font-semibold text-white">
              {paper.journalMetrics.tierLabel} · IF{" "}
              {paper.journalMetrics.impactFactor}
            </span>
          )}
          <h2 className="truncate text-sm font-semibold text-[#F4F4F5] sm:text-base">
            {paper.title}
          </h2>
        </div>

        {/* Desktop view mode switch */}
        <div className="hidden items-center gap-1 rounded-lg border border-[#2C2E35] bg-[#0E0F12] p-0.5 lg:flex">
          <button
            type="button"
            onClick={() => setDesktopView("split")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
              desktopView === "split"
                ? "bg-[#DB2777] text-white"
                : "text-[#A1A1AA] hover:text-white"
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
                ? "bg-[#DB2777] text-white"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            PDF Penuh
          </button>
          <button
            type="button"
            onClick={() => setDesktopView("translate")}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
              desktopView === "translate"
                ? "bg-[#DB2777] text-white"
                : "text-[#A1A1AA] hover:text-white"
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
                ? "bg-[#DB2777] text-white"
                : "text-[#A1A1AA] hover:text-white"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Tanya AI
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {paper.pdfUrl && (
            <button
              type="button"
              disabled={downloadingPdf}
              onClick={() => void handlePdfClick()}
              className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1.5 text-xs font-medium text-[#E4E4E7] hover:border-[#DB2777] disabled:opacity-60"
            >
              {downloadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F472B6]" />
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
            className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#DB2777] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
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
            className="btn-tactile inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full border border-[#2C2E35] text-[#A1A1AA] hover:border-[#3F414A] hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="grid grid-cols-3 border-b border-[#232429] bg-[#151619] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("pdf")}
          className={`min-h-[42px] border-b-2 text-xs font-semibold ${
            mobileTab === "pdf"
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
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
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
          }`}
        >
          Terjemahan
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`min-h-[42px] border-b-2 text-xs font-semibold ${
            mobileTab === "chat"
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
          }`}
        >
          Tanya AI
        </button>
      </div>

      {/* Main Split / Single Content Area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* PDF Viewer Pane */}
        <section
          className={`min-h-0 flex-1 flex-col border-[#232429] bg-[#151619] lg:border-r ${
            mobileTab === "pdf" ? "flex" : "hidden lg:flex"
          } ${desktopView === "translate" || desktopView === "chat" ? "lg:hidden" : ""}`}
        >
          {pdfProxyUrl ? (
            <div className="relative flex h-full w-full flex-col">
              <div className="flex items-center justify-between border-b border-[#232429] bg-[#151619] px-3 py-1.5 text-[11px] text-[#A1A1AA]">
                <span>Pratinjau PDF Langsung</span>
                <a
                  href={paper.pdfUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[#F472B6] hover:underline"
                >
                  Buka Sumber Asli <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {pdfLoading ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-[#0E0F12] p-6 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#DB2777]" />
                  <p className="text-xs font-medium text-[#A1A1AA]">
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
                <div className="flex flex-1 flex-col items-center justify-center bg-[#0E0F12] p-6 text-center">
                  <div className="max-w-md rounded-xl border border-[#2C2E35] bg-[#151619] p-6">
                    <AlertCircle className="mx-auto h-6 w-6 text-[#F87171]" />
                    <h3 className="mt-3 text-base font-semibold text-white">
                      Pratinjau PDF Dibatasi Penerbit
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#A1A1AA]">
                      {pdfLoadError}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <a
                        href={paper.pdfUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D]"
                      >
                        Buka PDF di Tab Baru{" "}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {paper.landingUrl && (
                        <a
                          href={paper.landingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3.5 py-1.5 text-xs font-medium text-[#E4E4E7] hover:border-[#DB2777]"
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
                        className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#DB2777]/35 bg-[#DB2777]/15 px-3.5 py-1.5 text-xs font-medium text-[#F9A8D4] hover:border-[#F472B6]"
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
              <p className="text-base font-semibold text-white">
                PDF langsung tidak tersedia dari penerbit
              </p>
              <p className="mt-1 max-w-md text-xs text-[#A1A1AA]">
                Anda tetap dapat membaca terjemahan Bahasa Indonesia di panel
                sebelah, atau membuka halaman penerbit.
              </p>
              {paper.landingUrl && (
                <a
                  href={paper.landingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tactile mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-2 text-xs font-semibold text-white"
                >
                  Buka Halaman Penerbit <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </section>

        {/* Auto-Translate Pane */}
        <section
          className={`min-h-0 flex-1 flex-col overflow-y-auto bg-[#0E0F12] ${
            mobileTab === "translate" ? "flex" : "hidden lg:flex"
          } ${desktopView === "pdf" || desktopView === "chat" ? "lg:hidden" : ""}`}
        >
          <div className="mx-auto w-full max-w-[70ch] p-4 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#232429] pb-4">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Languages className="h-4 w-4 text-[#F472B6]" />
                  Terjemahan Otomatis ke Bahasa Indonesia
                </div>
                <p className="mt-0.5 text-[11px] text-[#A1A1AA]">
                  Deteksi otomatis bahasa sumber (Inggris, Mandarin, Jepang,
                  Jerman, Arab, dll.)
                </p>
              </div>

              <button
                type="button"
                disabled={translating}
                onClick={() => void runTranslate()}
                className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
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
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-4 text-sm text-[#FCA5A5]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{translateError}</span>
              </div>
            )}

            {translating && (
              <div className="space-y-3 rounded-xl border border-[#232429] bg-[#151619] p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-[#F472B6]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mengekstrak teks &amp; menerjemahkan dengan
                  mv/zai-glm-5-3-flash...
                </div>
                <div className="h-4 w-3/4 animate-pulse rounded bg-[#232429]" />
                <div className="h-4 w-full animate-pulse rounded bg-[#232429]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[#232429]" />
              </div>
            )}

            {!translating && translatedMarkdown && (
              <article className="rounded-xl border border-[#232429] bg-[#151619] p-5 sm:p-7">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#232429] pb-3 text-[11px] text-[#71717A]">
                  <span className="font-mono">
                    {translateModel || "mv/zai-glm-5-3-flash"}
                  </span>
                  {translateCached && (
                    <span className="rounded bg-[#DB2777]/15 px-2 py-0.5 font-medium text-[#F472B6]">
                      Arsip Cache
                    </span>
                  )}
                </div>
                <MarkdownView content={translatedMarkdown} />
              </article>
            )}

            {!translating && !translatedMarkdown && !translateError && (
              <div className="rounded-xl border border-[#232429] bg-[#151619] p-6 text-center">
                <p className="text-base font-semibold text-white">
                  Siap Menerjemahkan Jurnal Ini
                </p>
                <p className="mt-1 text-xs text-[#A1A1AA]">
                  Klik tombol &ldquo;Terjemahkan Sekarang&rdquo; di atas untuk
                  membaca isi jurnal dalam Bahasa Indonesia yang rapi.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Tanya AI (Chat with PDF / Paper) Pane */}
        <section
          className={`min-h-0 flex-1 flex-col bg-[#0E0F12] ${
            mobileTab === "chat"
              ? "flex"
              : desktopView === "chat"
                ? "hidden lg:flex"
                : "hidden"
          }`}
        >
          <div className="mx-auto flex h-full w-full max-w-[74ch] flex-col p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#232429] pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DB2777]/15 text-[#F472B6]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Tanya AI tentang Jurnal Ini
                  </h3>
                  <p className="text-[11px] text-[#71717A]">
                    {chatUsedFullText === true
                      ? "Konteks: teks lengkap PDF"
                      : paper.pdfUrl
                        ? "Konteks: PDF penuh / abstrak otomatis"
                        : "Konteks: metadata & abstrak"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {chatMessages.length === 0 && (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-5">
                  <p className="text-xs font-medium text-[#D4D4D8]">
                    Ajukan pertanyaan apa saja tentang metode, temuan, sampel,
                    atau keterbatasan jurnal ini:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CHAT_STARTER_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendChatMessage(prompt)}
                        className="btn-tactile rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1.5 text-left text-xs text-[#E4E4E7] hover:border-[#F472B6]/45 hover:text-white"
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
                    className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#DB2777] text-white"
                        : "border border-[#232429] bg-[#151619] text-[#E4E4E7]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(msg.content);
                          setCopiedChatIdx(idx);
                          setTimeout(() => setCopiedChatIdx(null), 1500);
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#A1A1AA] hover:text-[#F472B6]"
                      >
                        {copiedChatIdx === idx ? (
                          <>
                            <Check className="h-3 w-3 text-[#4ADE80]" />
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
                <div className="flex items-center gap-2 rounded-xl border border-[#232429] bg-[#151619] px-4 py-3 text-xs text-[#F472B6]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Membaca isi jurnal &amp; menyusun jawaban...
                </div>
              )}

              {chatError && (
                <div className="flex items-center gap-2 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-xs text-[#FCA5A5]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendChatMessage(chatInput);
              }}
              className="mt-3 flex items-center gap-2 rounded-full border border-[#2C2E35] bg-[#151619] p-1.5 pl-4 focus-within:border-[#F472B6]"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Tanyakan metode, hasil, atau rincian isi jurnal..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-[#71717A] focus:outline-none"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="btn-tactile inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DB2777] text-white hover:bg-[#BE185D] disabled:opacity-50"
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
