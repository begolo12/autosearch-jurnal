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
  Sparkles,
} from "lucide-react";
import type { ConversionMode, JournalPaper } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex Q1",
  europepmc: "Europe PMC Q1",
};

const MODE_OPTIONS: Array<{
  value: ConversionMode;
  label: string;
  desc: string;
}> = [
  {
    value: "clean",
    label: "Konversi Rapi Utuh",
    desc: "Susun ulang teks PDF asli menjadi dokumen .docx terstruktur.",
  },
  {
    value: "translate_id",
    label: "Terjemahan Bahasa Indonesia",
    desc: "Terjemahkan isi jurnal dari bahasa apa pun ke Bahasa Indonesia (.docx).",
  },
  {
    value: "summary_id",
    label: "Ringkasan & Review Akademik",
    desc: "Ekstrak latar belakang, metode, temuan, dan kesimpulan ke .docx.",
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
  const isLongAbstract = abstractText.length > 280;
  const displayedAbstract =
    expandedAbstract || !isLongAbstract
      ? abstractText
      : `${abstractText.slice(0, 280).trimEnd()}...`;

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
        setAbstractTranslateErr(
          data.error || "Gagal menerjemahkan abstrak."
        );
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

  return (
    <article className="rounded-xl border border-[#E5DFD5] bg-white p-4 transition-colors duration-150 hover:border-[#CFC6B8] sm:p-5">
      {/* Q1 & Metadata strip */}
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        <span className="inline-flex items-center rounded-md bg-[#1B4D3E] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
          Q1
        </span>

        {paper.journalMetrics && (
          <span className="inline-flex items-center rounded-md border border-[#1B4D3E]/25 bg-[#1B4D3E]/8 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[#1B4D3E]">
            IF {paper.journalMetrics.impactFactor} · H-{paper.journalMetrics.hIndex}
          </span>
        )}

        <span className="inline-flex items-center rounded-md border border-[#E5DFD5] bg-[#FAF8F4] px-2 py-0.5 text-[11px] font-medium text-[#57534E]">
          {SOURCE_LABELS[paper.source] || paper.source}
        </span>

        {paper.language && (
          <span className="rounded bg-[#F2EFE9] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#57534E]">
            {paper.language}
          </span>
        )}

        {paper.year && (
          <span className="font-mono tabular-nums text-[#57534E]">
            {paper.year}
          </span>
        )}

        {paper.citations !== null && paper.citations >= 0 && (
          <span className="font-mono tabular-nums text-[#57534E]">
            {paper.citations.toLocaleString("id-ID")} sitasi
          </span>
        )}

        {paper.pdfUrl ? (
          <span className="inline-flex items-center rounded-md bg-[#9A3412]/10 px-2 py-0.5 font-medium text-[#9A3412]">
            PDF Langsung
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md bg-[#F2EFE9] px-2 py-0.5 text-[#57534E]">
            Halaman Penerbit
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="font-serif text-lg font-semibold leading-snug tracking-[-0.01em] text-[#1C1917] sm:text-[1.18rem]">
        {translatedAbstract ? translatedAbstract.title : paper.title}
      </h3>

      {/* Authors & Venue */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#57534E]">
        {paper.authors.length > 0 && (
          <span>
            {paper.authors.slice(0, 4).join(", ")}
            {paper.authors.length > 4
              ? ` +${paper.authors.length - 4} lainnya`
              : ""}
          </span>
        )}
        {paper.authors.length > 0 && paper.venue && (
          <span aria-hidden="true" className="text-[#CFC6B8]">
            •
          </span>
        )}
        {paper.venue && (
          <span className="italic text-[#57534E]">{paper.venue}</span>
        )}
      </div>

      {/* Abstract */}
      {abstractText ? (
        <div className="mt-3 max-w-[72ch] text-sm leading-relaxed text-[#44403C]">
          <p>
            {translatedAbstract
              ? translatedAbstract.abstract
              : displayedAbstract}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {!translatedAbstract && isLongAbstract && (
              <button
                type="button"
                onClick={() => setExpandedAbstract((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4D3E] hover:underline"
              >
                {expandedAbstract ? (
                  <>
                    Tutup ringkasan <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Baca abstrak lengkap <ChevronDown className="h-3.5 w-3.5" />
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
              className="inline-flex items-center gap-1 text-xs font-medium text-[#9A3412] hover:underline disabled:opacity-60"
            >
              {translatingAbstract ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Languages className="h-3.5 w-3.5" />
              )}
              {translatingAbstract
                ? "Menerjemahkan abstrak..."
                : translatedAbstract
                  ? "Lihat bahasa asli"
                  : "Terjemahkan abstrak ke ID"}
            </button>
          </div>
          {abstractTranslateErr && (
            <p className="mt-1 text-xs text-[#9A3412]">{abstractTranslateErr}</p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs italic text-[#78716C]">
          Abstrak tidak disediakan oleh indeks sumber.
        </p>
      )}

      {/* Touch-Friendly Action Strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#F2EFE9] pt-3.5 sm:flex sm:flex-wrap sm:items-center">
        {paper.pdfUrl && (
          <button
            type="button"
            onClick={() => onOpenReader(paper, false)}
            className="inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#143B2F]"
          >
            <BookOpenText className="h-3.5 w-3.5" />
            Baca PDF
          </button>
        )}

        <button
          type="button"
          onClick={() => onOpenReader(paper, true)}
          className="inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#1B4D3E]/30 bg-[#1B4D3E]/8 px-3.5 py-2 text-xs font-semibold text-[#1B4D3E] transition-colors hover:bg-[#1B4D3E]/15"
        >
          <Languages className="h-3.5 w-3.5" />
          Terjemahkan ID
        </button>

        {paper.pdfUrl && (
          <button
            type="button"
            disabled={isPdfLoading}
            onClick={() => void onDownloadPdf(paper)}
            className="inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-[#CFC6B8] bg-[#FAF8F4] px-3 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:bg-[#F2EFE9] disabled:opacity-60"
          >
            {isPdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileDown className="h-3.5 w-3.5 text-[#1B4D3E]" />
            )}
            {isPdfLoading ? "Mengunduh..." : "Unduh PDF"}
          </button>
        )}

        <button
          type="button"
          disabled={isConverting}
          onClick={() => setShowConvertPanel((v) => !v)}
          className={`inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60 ${
            showConvertPanel
              ? "border-[#9A3412] bg-[#9A3412]/10 text-[#9A3412]"
              : "border-[#CFC6B8] bg-[#FAF8F4] text-[#1C1917] hover:border-[#9A3412]/50 hover:bg-[#F2EFE9]"
          }`}
        >
          {isConverting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9A3412]" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-[#9A3412]" />
          )}
          {isConverting ? "Memproses..." : "Convert Word"}
        </button>

        <button
          type="button"
          disabled={bookmarkPending}
          onClick={() => void handleBookmarkClick()}
          className={`inline-flex min-h-[44px] sm:min-h-[36px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            isBookmarked
              ? "border-[#1B4D3E]/30 bg-[#1B4D3E]/10 text-[#1B4D3E]"
              : "border-[#E5DFD5] bg-white text-[#57534E] hover:border-[#CFC6B8] hover:text-[#1C1917]"
          }`}
        >
          {isBookmarked ? (
            <BookmarkCheck className="h-3.5 w-3.5" />
          ) : (
            <Bookmark className="h-3.5 w-3.5" />
          )}
          {isBookmarked ? "Tersimpan" : "Simpan"}
        </button>

        {paper.landingUrl && (
          <a
            href={paper.landingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] sm:min-h-[36px] sm:ml-auto items-center justify-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-[#57534E] transition-colors hover:bg-[#F2EFE9] hover:text-[#1C1917]"
          >
            Sumber <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Inline AI Word Conversion Panel */}
      {showConvertPanel && (
        <div className="mt-3.5 rounded-lg border border-[#E5DFD5] bg-[#FAF8F4] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
              <Sparkles className="h-3.5 w-3.5 text-[#9A3412]" />
              Pilih Mode Konversi Word (.docx)
            </div>
            <span className="font-mono text-[11px] text-[#57534E]">
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
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-[#1B4D3E] bg-white"
                      : "border-[#E5DFD5] bg-white/60 hover:border-[#CFC6B8]"
                  }`}
                >
                  <div className="text-xs font-semibold text-[#1C1917]">
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-[#57534E]">
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[#57534E]">
              {paper.pdfUrl
                ? "Teks PDF akan diekstrak otomatis lalu dirapikan menjadi .docx."
                : "PDF langsung tidak tersedia; konversi memakai metadata & abstrak."}
            </p>
            <button
              type="button"
              disabled={isConverting}
              onClick={() => void onConvertWord(paper, selectedMode)}
              className="inline-flex min-h-[44px] sm:min-h-[36px] items-center gap-1.5 rounded-lg bg-[#9A3412] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7C2D12] disabled:opacity-60"
            >
              {isConverting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {isConverting ? "Memproses AI..." : "Proses & Unduh .docx"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
