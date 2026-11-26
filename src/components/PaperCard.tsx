"use client";

import { useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileDown,
  FileText,
  Languages,
  Loader2,
} from "lucide-react";
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

  const tierLabel = paper.journalMetrics?.tierLabel || "Q1";
  const isTopTier =
    paper.journalMetrics?.primaryTier === "Q1" ||
    paper.journalMetrics?.primaryTier === "SINTA1";

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
    <article className="py-5 sm:grid sm:grid-cols-[84px_1fr] sm:gap-5">
      {/* Left Bibliographic Rank Margin */}
      <div className="mb-2 flex items-baseline gap-2.5 sm:mb-0 sm:block sm:pt-0.5">
        <div
          className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-semibold tracking-tight ${
            isTopTier
              ? "bg-[#154033] text-white"
              : "border border-[#C9C4B8] bg-[#F8F7F4] text-[#161513]"
          }`}
        >
          {tierLabel}
        </div>
        {paper.journalMetrics && (
          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[#78756E] sm:mt-1.5 sm:block sm:space-y-0.5">
            <div>IF {paper.journalMetrics.impactFactor}</div>
            <div>H-{paper.journalMetrics.hIndex}</div>
          </div>
        )}
      </div>

      {/* Right Content Column */}
      <div className="min-w-0">
        <h3 className="font-serif text-[1.125rem] font-semibold leading-snug tracking-[-0.015em] text-[#161513] sm:text-[1.18rem]">
          {translatedAbstract ? translatedAbstract.title : paper.title}
        </h3>

        <p className="mt-1.5 text-[13px] leading-relaxed text-[#57554F]">
          {metaItems.join(" · ")}
        </p>

        {abstractText ? (
          <div className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-[#2C2A27]">
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
                  className="inline-flex items-center gap-0.5 font-medium text-[#154033] hover:underline"
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
                className="inline-flex items-center gap-1 font-medium text-[#57554F] underline decoration-[#C9C4B8] underline-offset-2 transition-colors hover:text-[#154033] hover:decoration-[#154033] disabled:opacity-60"
              >
                {translatingAbstract ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
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
              <p className="mt-1 text-xs text-[#8C3B1A]">
                {abstractTranslateErr}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-[#78756E]">
            Abstrak tidak tersedia di indeks sumber.
          </p>
        )}

        {/* Editorial Action Bar */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {paper.pdfUrl ? (
            <button
              type="button"
              onClick={() => onOpenReader(paper, false)}
              className="inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-md bg-[#154033] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#0F2E24]"
            >
              <BookOpenText className="h-3.5 w-3.5" />
              Baca PDF
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenReader(paper, true)}
              className="inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-md bg-[#154033] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#0F2E24]"
            >
              <Languages className="h-3.5 w-3.5" />
              Terjemahkan ID
            </button>
          )}

          {paper.pdfUrl && (
            <button
              type="button"
              onClick={() => onOpenReader(paper, true)}
              className="inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-md border border-[#C9C4B8] bg-white px-3 py-1.5 text-xs font-medium text-[#161513] transition-colors duration-150 hover:border-[#154033] hover:text-[#154033]"
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
              className="inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-md border border-[#E2DFD7] bg-white px-3 py-1.5 text-xs font-medium text-[#57554F] transition-colors duration-150 hover:border-[#C9C4B8] hover:text-[#161513] disabled:opacity-60"
            >
              {isPdfLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              {isPdfLoading ? "Mengunduh..." : "Unduh PDF"}
            </button>
          )}

          <button
            type="button"
            disabled={isConverting}
            onClick={() => setShowConvertPanel((v) => !v)}
            className={`inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-60 ${
              showConvertPanel
                ? "border-[#154033] bg-[#F8F7F4] text-[#154033]"
                : "border-[#E2DFD7] bg-white text-[#57554F] hover:border-[#C9C4B8] hover:text-[#161513]"
            }`}
          >
            {isConverting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {isConverting ? "Memproses..." : "Ekspor Word"}
          </button>

          <button
            type="button"
            disabled={bookmarkPending}
            onClick={() => void handleBookmarkClick()}
            className={`inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${
              isBookmarked
                ? "border-[#154033]/35 bg-[#154033]/8 text-[#154033]"
                : "border-[#E2DFD7] bg-white text-[#57554F] hover:border-[#C9C4B8] hover:text-[#161513]"
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
              className="inline-flex min-h-[40px] sm:min-h-[34px] sm:ml-auto items-center gap-1 px-2 py-1.5 text-xs font-medium text-[#78756E] transition-colors hover:text-[#161513]"
            >
              Sumber <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Inline Word Export Panel */}
        {showConvertPanel && (
          <div className="mt-3 rounded-md border border-[#E2DFD7] bg-[#F8F7F4] p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#161513]">
                Format Dokumen Word (.docx)
              </span>
              <span className="font-mono text-[11px] text-[#78756E]">
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
                    className={`rounded-md border p-2.5 text-left transition-colors duration-150 ${
                      active
                        ? "border-[#154033] bg-white"
                        : "border-[#E2DFD7] bg-white/70 hover:border-[#C9C4B8]"
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#161513]">
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-[#57554F]">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-[#57554F]">
                {paper.pdfUrl
                  ? "Teks PDF diekstrak otomatis lalu disusun menjadi berkas .docx."
                  : "PDF langsung tidak tersedia; menggunakan metadata & abstrak."}
              </p>
              <button
                type="button"
                disabled={isConverting}
                onClick={() => void onConvertWord(paper, selectedMode)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#154033] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0F2E24] disabled:opacity-60"
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
