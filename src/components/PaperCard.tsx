"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileDown,
  FileText,
  Languages,
  Loader2,
  Quote,
} from "lucide-react";
import { formatCitation, type CitationFormat } from "@/lib/citation";
import type { ConversionMode, JournalPaper } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  europepmc: "Europe PMC",
};

const MODE_OPTIONS: Array<{
  value: ConversionMode;
  label: string;
  desc: string;
}> = [
  {
    value: "clean",
    label: "Naskah Rapi Utuh",
    desc: "Susun ulang teks PDF asli ke format Word (.docx) terstruktur.",
  },
  {
    value: "translate_id",
    label: "Terjemahan Bahasa Indonesia",
    desc: "Terjemahkan seluruh isi jurnal ke Bahasa Indonesia baku (.docx).",
  },
  {
    value: "summary_id",
    label: "Ringkasan Akademik",
    desc: "Ekstrak latar belakang, metode, temuan, dan kesimpulan (.docx).",
  },
];

interface PaperCardProps {
  paper: JournalPaper;
  isBookmarked: boolean;
  onToggleBookmark: (paper: JournalPaper) => Promise<void>;
  onDownloadPdf: (paper: JournalPaper) => Promise<void>;
  onOpenReader: (paper: JournalPaper, autoTranslate?: boolean) => void;
  onConvertWord: (paper: JournalPaper, mode: ConversionMode) => Promise<void>;
  downloadingPdfKey: string | null;
  convertingKey: string | null;
}

export function PaperCard({
  paper,
  isBookmarked,
  onToggleBookmark,
  onDownloadPdf,
  onOpenReader,
  onConvertWord,
  downloadingPdfKey,
  convertingKey,
}: PaperCardProps) {
  const [expandedAbstract, setExpandedAbstract] = useState(false);
  const [showConvertPanel, setShowConvertPanel] = useState(false);
  const [showCitePanel, setShowCitePanel] = useState(false);
  const [citeFormat, setCiteFormat] = useState<CitationFormat>("apa");
  const [copiedCite, setCopiedCite] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ConversionMode>("clean");
  const [bookmarkPending, setBookmarkPending] = useState(false);

  const [translatingAbstract, setTranslatingAbstract] = useState(false);
  const [translatedAbstract, setTranslatedAbstract] = useState<{
    title: string;
    abstract: string;
  } | null>(null);
  const [abstractTranslateErr, setAbstractTranslateErr] = useState<
    string | null
  >(null);

  const isPdfLoading = downloadingPdfKey === paper.paperKey;
  const isConverting = convertingKey === paper.paperKey;

  const abstractText = paper.abstract || "";
  const isLongAbstract = abstractText.length > 260;
  const displayedAbstract =
    expandedAbstract || !isLongAbstract
      ? abstractText
      : `${abstractText.slice(0, 260).trimEnd()}...`;

  const handleBookmarkClick = async () => {
    setBookmarkPending(true);
    try {
      await onToggleBookmark(paper);
    } finally {
      setBookmarkPending(false);
    }
  };

  const handleCopyCitation = async () => {
    const text = formatCitation(paper, citeFormat);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCite(true);
      setTimeout(() => setCopiedCite(false), 2000);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleTranslateAbstract = async () => {
    if (!paper.abstract) return;
    setTranslatingAbstract(true);
    setAbstractTranslateErr(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperKey: paper.paperKey,
          title: paper.title,
          abstract: paper.abstract,
          language: paper.language,
          scope: "abstract",
        }),
      });
      const data = (await res.json()) as {
        translatedTitle?: string;
        translatedAbstract?: string;
        error?: string;
      };
      if (!res.ok || !data.translatedAbstract) {
        setAbstractTranslateErr(data.error || "Gagal menerjemahkan abstrak.");
        return;
      }
      setTranslatedAbstract({
        title: data.translatedTitle || paper.title,
        abstract: data.translatedAbstract,
      });
    } catch {
      setAbstractTranslateErr("Gagal menghubungi server terjemahan.");
    } finally {
      setTranslatingAbstract(false);
    }
  };

  const tier = paper.journalMetrics?.primaryTier;
  const tierLabel = paper.journalMetrics?.tierLabel || "Q1";

  const tierBadgeClass =
    tier === "Q1" || tier === "SINTA1"
      ? "bg-[#DB2777] text-white"
      : tier === "Q2" || tier === "SINTA2"
        ? "bg-[#DB2777]/15 text-[#F472B6] border border-[#DB2777]/30"
        : "border border-[#2C2E35] bg-[#1E1F23] text-[#D4D4D8]";

  const metaItems: string[] = [];
  if (paper.authors.length > 0) {
    const firstAuthors = paper.authors.slice(0, 3).join(", ");
    metaItems.push(
      paper.authors.length > 3 ? `${firstAuthors} dkk.` : firstAuthors
    );
  }
  if (paper.venue) metaItems.push(paper.venue);
  if (paper.year) metaItems.push(String(paper.year));
  if (paper.citations !== null && paper.citations >= 0) {
    metaItems.push(`${paper.citations.toLocaleString("id-ID")} sitasi`);
  }
  metaItems.push(SOURCE_LABELS[paper.source] || paper.source);
  if (paper.language) metaItems.push(paper.language);

  return (
    <article className="-mx-3 rounded-xl px-3 py-5 transition-colors duration-150 hover:bg-[#16171B] sm:grid sm:grid-cols-[88px_1fr] sm:gap-5">
      {/* Left Rank Indicator */}
      <div className="mb-2 flex items-baseline gap-2.5 sm:mb-0 sm:block sm:pt-0.5">
        <span
          className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs font-semibold tracking-tight ${tierBadgeClass}`}
        >
          {tierLabel}
        </span>
        {paper.journalMetrics && (
          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[#71717A] sm:mt-1.5 sm:block sm:space-y-0.5">
            <div>IF {paper.journalMetrics.impactFactor}</div>
            <div>H-{paper.journalMetrics.hIndex}</div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.015em] text-[#F4F4F5] sm:text-[17px]">
          {translatedAbstract ? translatedAbstract.title : paper.title}
        </h3>

        <p className="mt-1 text-[13px] leading-relaxed text-[#A1A1AA]">
          {metaItems.join(" · ")}
        </p>

        {abstractText ? (
          <div className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-[#D4D4D8]">
            <p>
              {translatedAbstract
                ? translatedAbstract.abstract
                : displayedAbstract}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {!translatedAbstract && isLongAbstract && (
                <button
                  type="button"
                  onClick={() => setExpandedAbstract((v) => !v)}
                  className="inline-flex items-center gap-0.5 font-medium text-[#F472B6] hover:text-[#F9A8D4]"
                >
                  {expandedAbstract ? (
                    <>
                      Ringkas <ChevronUp className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Selengkapnya <ChevronDown className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                disabled={translatingAbstract}
                onClick={() =>
                  translatedAbstract
                    ? setTranslatedAbstract(null)
                    : void handleTranslateAbstract()
                }
                className="inline-flex items-center gap-1 font-medium text-[#A1A1AA] transition-colors hover:text-[#F472B6] disabled:opacity-60"
              >
                {translatingAbstract ? (
                  <Loader2 className="h-3 w-3 animate-spin text-[#F472B6]" />
                ) : (
                  <Languages className="h-3.5 w-3.5" />
                )}
                {translatingAbstract
                  ? "Menerjemahkan..."
                  : translatedAbstract
                    ? "Lihat bahasa asli"
                    : "Terjemahkan abstrak"}
              </button>
            </div>
            {abstractTranslateErr && (
              <p className="mt-1 text-xs text-[#F87171]">
                {abstractTranslateErr}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-[#71717A]">
            Abstrak tidak tersedia di indeks sumber.
          </p>
        )}

        {/* Action Row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {paper.pdfUrl ? (
            <button
              type="button"
              onClick={() => onOpenReader(paper, false)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D]"
            >
              <BookOpenText className="h-3.5 w-3.5" />
              Baca PDF
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenReader(paper, true)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D]"
            >
              <Languages className="h-3.5 w-3.5" />
              Terjemahkan ID
            </button>
          )}

          {paper.pdfUrl && (
            <button
              type="button"
              onClick={() => onOpenReader(paper, true)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border border-[#DB2777]/35 bg-[#DB2777]/12 px-3.5 py-1.5 text-xs font-medium text-[#F9A8D4] hover:border-[#F472B6] hover:bg-[#DB2777]/20"
            >
              <Languages className="h-3.5 w-3.5" />
              Terjemahkan ID
            </button>
          )}

          {paper.pdfUrl && (
            <button
              type="button"
              disabled={isPdfLoading}
              onClick={() => void onDownloadPdf(paper)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1.5 text-xs font-medium text-[#E4E4E7] hover:border-[#3F414A] hover:text-white disabled:opacity-60"
            >
              {isPdfLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F472B6]" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              {isPdfLoading ? "Mengunduh..." : "Unduh PDF"}
            </button>
          )}

          <button
            type="button"
            disabled={isConverting}
            onClick={() => {
              setShowConvertPanel((v) => !v);
              setShowCitePanel(false);
            }}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
              showConvertPanel
                ? "border-[#DB2777] bg-[#DB2777]/15 text-[#F9A8D4]"
                : "border-[#2C2E35] bg-[#1E1F23] text-[#E4E4E7] hover:border-[#3F414A] hover:text-white"
            }`}
          >
            {isConverting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F472B6]" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {isConverting ? "Memproses..." : "Ekspor Word"}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowCitePanel((v) => !v);
              setShowConvertPanel(false);
            }}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              showCitePanel
                ? "border-[#DB2777] bg-[#DB2777]/15 text-[#F9A8D4]"
                : "border-[#2C2E35] bg-[#1E1F23] text-[#E4E4E7] hover:border-[#3F414A] hover:text-white"
            }`}
          >
            <Quote className="h-3.5 w-3.5" />
            <span>Sitasi</span>
          </button>

          <button
            type="button"
            disabled={bookmarkPending}
            onClick={() => void handleBookmarkClick()}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              isBookmarked
                ? "border-[#DB2777]/45 bg-[#DB2777]/15 text-[#F9A8D4]"
                : "border-[#2C2E35] bg-[#1E1F23] text-[#E4E4E7] hover:border-[#3F414A] hover:text-white"
            }`}
          >
            {isBookmarked ? (
              <BookmarkCheck className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
            <span>{isBookmarked ? "Tersimpan" : "Simpan"}</span>
          </button>

          {paper.landingUrl && (
            <a
              href={paper.landingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] sm:min-h-[34px] sm:ml-auto items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#A1A1AA] transition-colors hover:text-white"
            >
              Sumber <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Inline 1-Click Citation Panel */}
        {showCitePanel && (
          <div className="animate-panel-open mt-3 rounded-xl border border-[#2C2E35] bg-[#151619] p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: "apa", label: "APA 7" },
                    { id: "ieee", label: "IEEE" },
                    { id: "bibtex", label: "BibTeX" },
                  ] as const
                ).map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => {
                      setCiteFormat(fmt.id);
                      setCopiedCite(false);
                    }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      citeFormat === fmt.id
                        ? "bg-[#DB2777] text-white"
                        : "bg-[#1E1F23] text-[#A1A1AA] hover:text-white"
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleCopyCitation()}
                className="btn-tactile inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-[#2C2E35] bg-[#1E1F23] px-3 py-1 text-xs font-semibold text-[#F4F4F5] hover:border-[#DB2777]"
              >
                {copiedCite ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#4ADE80]" />
                    <span className="text-[#4ADE80]">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin Sitasi</span>
                  </>
                )}
              </button>
            </div>

            <pre className="whitespace-pre-wrap break-words rounded-lg border border-[#232429] bg-[#0E0F12] p-3 font-mono text-[11px] leading-relaxed text-[#D4D4D8]">
              {formatCitation(paper, citeFormat)}
            </pre>
          </div>
        )}

        {/* Inline Word Export Panel */}
        {showConvertPanel && (
          <div className="animate-panel-open mt-3 rounded-xl border border-[#2C2E35] bg-[#151619] p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#F4F4F5]">
                Format Dokumen Word (.docx)
              </span>
              <span className="font-mono text-[11px] text-[#71717A]">
                mv/zai-glm-5-3-flash
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {MODE_OPTIONS.map((opt) => {
                const active = selectedMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedMode(opt.value)}
                    className={`rounded-lg border p-2.5 text-left transition-colors duration-150 ${
                      active
                        ? "border-[#DB2777] bg-[#1E1F23]"
                        : "border-[#232429] bg-[#0E0F12] hover:border-[#2C2E35]"
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#F4F4F5]">
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-[#A1A1AA]">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-[#A1A1AA]">
                {paper.pdfUrl
                  ? "Teks PDF diekstrak otomatis lalu disusun menjadi berkas .docx."
                  : "PDF langsung tidak tersedia; menggunakan metadata & abstrak."}
              </p>
              <button
                type="button"
                disabled={isConverting}
                onClick={() => void onConvertWord(paper, selectedMode)}
                className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
              >
                {isConverting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                {isConverting ? "Memproses..." : "Unduh .docx"}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
