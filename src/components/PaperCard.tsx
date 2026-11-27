"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileDown,
  FileText,
  FolderOpen,
  GitBranch,
  Languages,
  Loader2,
  Quote,
  Sparkles,
  Square,
  StickyNote,
} from "lucide-react";
import { formatCitation, type CitationFormat } from "@/lib/citation";
import {
  getCachedAbstractTranslation,
  getCachedTakeaways,
  setCachedAbstractTranslation,
  setCachedTakeaways,
} from "@/lib/local-cache";
import type {
  ConversionMode,
  JournalPaper,
  PaperTakeaways,
  ResearchProjectRecord,
} from "@/lib/types";
import { getSafeHttpUrl } from "@/lib/url";

const SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  europepmc: "Europe PMC",
  crossref: "Crossref",
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
  selectedForMatrix?: boolean;
  onToggleSelectMatrix?: (paper: JournalPaper) => void;
  onOpenNetwork?: (paper: JournalPaper) => void;
  bookmarkId?: string;
  projectId?: string | null;
  note?: string | null;
  projects?: ResearchProjectRecord[];
  onUpdateBookmarkMeta?: (
    bookmarkId: string,
    patch: { projectId?: string | null; note?: string | null }
  ) => Promise<void>;
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
  selectedForMatrix = false,
  onToggleSelectMatrix,
  onOpenNetwork,
  bookmarkId,
  projectId,
  note,
  projects,
  onUpdateBookmarkMeta,
}: PaperCardProps) {
  const [expandedAbstract, setExpandedAbstract] = useState(false);
  const [showConvertPanel, setShowConvertPanel] = useState(false);
  const [showCitePanel, setShowCitePanel] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [noteDraft, setNoteDraft] = useState(note || "");
  const [savingMeta, setSavingMeta] = useState(false);
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

  const [loadingTakeaways, setLoadingTakeaways] = useState(false);
  const [takeaways, setTakeaways] = useState<PaperTakeaways | null>(null);
  const [showTakeaways, setShowTakeaways] = useState(false);
  const [takeawaysErr, setTakeawaysErr] = useState<string | null>(null);

  const [copiedDoi, setCopiedDoi] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTranslation, setCopiedTranslation] = useState(false);
  const [copiedTakeaways, setCopiedTakeaways] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const savedFmt = window.localStorage.getItem(
          "smartsari:v1:pref_cite_format"
        );
        if (savedFmt === "apa" || savedFmt === "ieee" || savedFmt === "bibtex") {
          setCiteFormat(savedFmt);
        }
      } catch {
        // Ignore storage errors
      }
      const cachedAbs = getCachedAbstractTranslation(paper.paperKey);
      if (cachedAbs) {
        setTranslatedAbstract(cachedAbs);
      }
      const cachedTak = getCachedTakeaways(paper.paperKey);
      if (cachedTak) {
        setTakeaways(cachedTak);
      }
    });
  }, [paper.paperKey]);

  const handleExtractTakeaways = async () => {
    if (!paper.abstract) return;
    if (takeaways) {
      setShowTakeaways((v) => !v);
      return;
    }
    const cached = getCachedTakeaways(paper.paperKey);
    if (cached) {
      setTakeaways(cached);
      setShowTakeaways(true);
      return;
    }
    setLoadingTakeaways(true);
    setTakeawaysErr(null);
    try {
      const res = await fetch("/api/ai/takeaways", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: paper.title,
          abstract: paper.abstract,
          venue: paper.venue,
          year: paper.year,
        }),
      });
      const data = (await res.json()) as {
        takeaways?: PaperTakeaways;
        error?: string;
      };
      if (!res.ok || !data.takeaways) {
        setTakeawaysErr(data.error || "Gagal mengekstrak intisari AI.");
        return;
      }
      setTakeaways(data.takeaways);
      setCachedTakeaways(paper.paperKey, data.takeaways);
      setShowTakeaways(true);
    } catch {
      setTakeawaysErr("Gagal menghubungi server AI.");
    } finally {
      setLoadingTakeaways(false);
    }
  };

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
    const cached = getCachedAbstractTranslation(paper.paperKey);
    if (cached) {
      setTranslatedAbstract(cached);
      return;
    }
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
      const nextTranslation = {
        title: data.translatedTitle || paper.title,
        abstract: data.translatedAbstract,
      };
      setTranslatedAbstract(nextTranslation);
      setCachedAbstractTranslation(paper.paperKey, nextTranslation);
    } catch {
      setAbstractTranslateErr("Gagal menghubungi server terjemahan.");
    } finally {
      setTranslatingAbstract(false);
    }
  };

  const tier = paper.journalMetrics?.primaryTier;
  const tierLabel = paper.journalMetrics?.tierLabel || null;
  const hasImpactMetrics = Boolean(
    paper.journalMetrics &&
      (paper.journalMetrics.impactFactor > 0 ||
        paper.journalMetrics.hIndex > 0)
  );

  const tierBadgeClass =
    tier === "Q1" || tier === "SINTA1"
      ? "bg-[#DB2777] text-white shadow-[0_0_12px_rgba(219,39,119,0.28)]"
      : tier === "Q2" || tier === "SINTA2"
        ? "bg-[#DB2777]/15 text-[#F472B6] border border-[#DB2777]/35"
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
    <article className="-mx-3 rounded-2xl border border-transparent px-3.5 py-5 transition-all duration-150 hover:border-[#232429] hover:bg-[#151619]/85 sm:grid sm:grid-cols-[88px_1fr] sm:gap-5">
      {/* Left Rank Indicator */}
      <div className="mb-2 flex items-baseline gap-2.5 sm:mb-0 sm:block sm:pt-0.5">
        {tierLabel ? (
          <span
            className={`inline-block rounded-md px-2 py-0.5 font-mono text-xs font-semibold tracking-tight ${tierBadgeClass}`}
          >
            {tierLabel}
          </span>
        ) : (
          <span className="inline-block rounded-md border border-[#2C2E35] bg-[#1E1F23] px-2 py-0.5 font-mono text-[11px] font-medium text-[#A1A1AA]">
            Jurnal
          </span>
        )}
        {hasImpactMetrics && paper.journalMetrics && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-[#A1A1AA] sm:mt-2 sm:flex-col sm:items-start sm:gap-1">
            <span className="rounded border border-[#232429] bg-[#0E0F12] px-1.5 py-0.5">
              IF {paper.journalMetrics.impactFactor}
            </span>
            <span className="rounded border border-[#232429] bg-[#0E0F12] px-1.5 py-0.5">
              H-{paper.journalMetrics.hIndex}
            </span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.015em] text-[#F4F4F5] sm:text-[17px]">
            {translatedAbstract ? translatedAbstract.title : paper.title}
          </h3>
          <button
            type="button"
            title="Salin judul"
            aria-label="Salin judul artikel"
            onClick={() => {
              const titleText = translatedAbstract
                ? translatedAbstract.title
                : paper.title;
              void navigator.clipboard
                .writeText(titleText)
                .then(() => {
                  setCopiedTitle(true);
                  setTimeout(() => setCopiedTitle(false), 1600);
                })
                .catch(() => {});
            }}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[11px] text-[#71717A] transition-colors hover:border-[#2C2E35] hover:bg-[#1E1F23] hover:text-white"
          >
            {copiedTitle ? (
              <Check className="h-3.5 w-3.5 text-[#4ADE80]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] leading-relaxed text-[#A1A1AA]">
          {paper.pdfUrl ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              PDF Gratis
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#2C2E35] bg-[#1E1F23] px-2 py-0.5 text-[11px] font-medium text-[#A1A1AA]">
              Abstrak / DOI
            </span>
          )}
          <span>{metaItems.join(" · ")}</span>
          {paper.doi && (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(paper.doi!)
                  .then(() => {
                    setCopiedDoi(true);
                    setTimeout(() => setCopiedDoi(false), 1800);
                  })
                  .catch(() => {});
              }}
              className="inline-flex items-center gap-1 rounded border border-[#2C2E35] bg-[#1E1F23] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A1AA] transition-colors hover:border-[#F472B6]/45 hover:text-white"
            >
              {copiedDoi ? (
                <>
                  <Check className="h-2.5 w-2.5 text-[#4ADE80]" />
                  <span className="text-[#4ADE80]">DOI tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-2.5 w-2.5" />
                  <span>DOI</span>
                </>
              )}
            </button>
          )}
          {(paper.doi || getSafeHttpUrl(paper.landingUrl)) && (
            <button
              type="button"
              onClick={() => {
                const link = paper.doi
                  ? `https://doi.org/${paper.doi}`
                  : getSafeHttpUrl(paper.landingUrl);
                if (!link) return;
                void navigator.clipboard
                  .writeText(link)
                  .then(() => {
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1800);
                  })
                  .catch(() => {});
              }}
              className="inline-flex items-center gap-1 rounded border border-[#2C2E35] bg-[#1E1F23] px-1.5 py-0.5 text-[10px] text-[#A1A1AA] transition-colors hover:border-[#F472B6]/45 hover:text-white"
            >
              {copiedLink ? (
                <>
                  <Check className="h-2.5 w-2.5 text-[#4ADE80]" />
                  <span className="text-[#4ADE80]">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-2.5 w-2.5" />
                  <span>Salin tautan</span>
                </>
              )}
            </button>
          )}
        </div>

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

              {translatedAbstract && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `${translatedAbstract.title}\n\n${translatedAbstract.abstract}`
                      )
                      .then(() => {
                        setCopiedTranslation(true);
                        setTimeout(() => setCopiedTranslation(false), 1800);
                      })
                      .catch(() => {});
                  }}
                  className="inline-flex items-center gap-1 font-medium text-[#A1A1AA] transition-colors hover:text-[#F472B6]"
                >
                  {copiedTranslation ? (
                    <>
                      <Check className="h-3 w-3 text-[#4ADE80]" />
                      <span className="text-[#4ADE80]">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Salin terjemahan</span>
                    </>
                  )}
                </button>
              )}

              {abstractText.length >= 20 && (
                <button
                  type="button"
                  disabled={loadingTakeaways}
                  onClick={() => void handleExtractTakeaways()}
                  className="inline-flex items-center gap-1 font-medium text-[#A1A1AA] transition-colors hover:text-[#F472B6] disabled:opacity-60"
                >
                  {loadingTakeaways ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[#F472B6]" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[#F472B6]" />
                  )}
                  {loadingTakeaways
                    ? "Meringkas..."
                    : showTakeaways
                      ? "Sembunyikan Intisari"
                      : "Intisari AI"}
                </button>
              )}
            </div>
            {abstractTranslateErr && (
              <p className="mt-1 text-xs text-[#F87171]">
                {abstractTranslateErr}
              </p>
            )}
            {takeawaysErr && (
              <p className="mt-1 text-xs text-[#F87171]">{takeawaysErr}</p>
            )}
            {showTakeaways && takeaways && (
              <div className="animate-panel-open mt-2.5 rounded-xl border border-[#2C2E35] bg-[#151619] p-3 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-[#232429] pb-1.5">
                  <span className="text-[11px] font-semibold text-[#F9A8D4]">
                    Intisari Terstruktur
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = [
                        `Masalah: ${takeaways.problem}`,
                        `Metode: ${takeaways.method}`,
                        `Temuan: ${takeaways.finding}`,
                        `Implikasi: ${takeaways.implication}`,
                      ].join("\n");
                      void navigator.clipboard
                        .writeText(text)
                        .then(() => {
                          setCopiedTakeaways(true);
                          setTimeout(() => setCopiedTakeaways(false), 1800);
                        })
                        .catch(() => {});
                    }}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#A1A1AA] transition-colors hover:bg-[#1E1F23] hover:text-white"
                  >
                    {copiedTakeaways ? (
                      <>
                        <Check className="h-3 w-3 text-[#4ADE80]" />
                        <span className="text-[#4ADE80]">Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Salin intisari</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {[
                    { label: "Masalah", value: takeaways.problem },
                    { label: "Metode", value: takeaways.method },
                    { label: "Temuan", value: takeaways.finding },
                    { label: "Implikasi", value: takeaways.implication },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-[#232429] bg-[#0E0F12]/90 p-2.5"
                    >
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[#F472B6]">
                        {item.label}
                      </span>
                      <span className="leading-relaxed text-[#E4E4E7]">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
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
              Baca &amp; AI
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenReader(paper, true)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D]"
            >
              <Languages className="h-3.5 w-3.5" />
              Terjemahkan &amp; AI
            </button>
          )}

          <button
            type="button"
            disabled={isConverting || isPdfLoading}
            onClick={() => {
              setShowConvertPanel((v) => !v);
              setShowCitePanel(false);
              setShowNotePanel(false);
            }}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
              showConvertPanel
                ? "border-[#DB2777] bg-[#DB2777]/15 text-[#F9A8D4]"
                : "border-[#2C2E35] bg-[#1E1F23] text-[#E4E4E7] hover:border-[#3F414A] hover:text-white"
            }`}
          >
            {isConverting || isPdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F472B6]" />
            ) : (
              <FileDown className="h-3.5 w-3.5" />
            )}
            <span>
              {isConverting
                ? "Memproses..."
                : isPdfLoading
                  ? "Mengunduh..."
                  : "Unduh / Ekspor"}
            </span>
            {showConvertPanel ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowCitePanel((v) => !v);
              setShowConvertPanel(false);
              setShowNotePanel(false);
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

          {onOpenNetwork && (
            <button
              type="button"
              onClick={() => onOpenNetwork(paper)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:border-[#F472B6]/45 hover:text-[#F9A8D4]"
            >
              <GitBranch className="h-3.5 w-3.5 text-[#F472B6]" />
              <span>Jejaring</span>
            </button>
          )}

          {onToggleSelectMatrix && (
            <button
              type="button"
              onClick={() => onToggleSelectMatrix(paper)}
              className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                selectedForMatrix
                  ? "border-[#F472B6] bg-[#DB2777]/20 text-[#FBCFE8]"
                  : "border-[#2C2E35] bg-[#1E1F23] text-[#A1A1AA] hover:border-[#3F414A] hover:text-white"
              }`}
            >
              {selectedForMatrix ? (
                <CheckSquare className="h-3.5 w-3.5 text-[#F472B6]" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              <span>{selectedForMatrix ? "Dipilih" : "Bandingkan"}</span>
            </button>
          )}

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

          {bookmarkId && onUpdateBookmarkMeta && (
            <button
              type="button"
              onClick={() => {
                setShowNotePanel((v) => !v);
                setShowConvertPanel(false);
                setShowCitePanel(false);
              }}
              className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                showNotePanel || note || projectId
                  ? "border-[#DB2777]/40 bg-[#DB2777]/12 text-[#F9A8D4]"
                  : "border-[#2C2E35] bg-[#1E1F23] text-[#A1A1AA] hover:border-[#3F414A] hover:text-white"
              }`}
            >
              <StickyNote className="h-3.5 w-3.5" />
              <span>{note ? "Catatan ✓" : "Proyek & Catatan"}</span>
            </button>
          )}
        </div>

        {/* Inline 1-Click Citation Panel */}
        {showCitePanel && (
          <div className="animate-panel-open mt-3 rounded-xl border border-[#2C2E35] border-t-2 border-t-[#DB2777]/65 bg-[#151619] p-3.5 shadow-lg">
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
                      try {
                        window.localStorage.setItem(
                          "smartsari:v1:pref_cite_format",
                          fmt.id
                        );
                      } catch {
                        // Ignore storage errors
                      }
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

        {/* Unified Download & Word Export Panel */}
        {showConvertPanel && (
          <div className="animate-panel-open mt-3 rounded-xl border border-[#2C2E35] border-t-2 border-t-[#DB2777]/65 bg-[#151619] p-3.5 shadow-lg">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#232429] pb-3">
              {paper.pdfUrl && (
                <button
                  type="button"
                  disabled={isPdfLoading}
                  onClick={() => void onDownloadPdf(paper)}
                  className="btn-tactile inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1 text-xs font-medium text-[#E4E4E7] hover:border-[#DB2777] hover:text-white disabled:opacity-60"
                >
                  {isPdfLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F472B6]" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 text-[#F472B6]" />
                  )}
                  <span>{isPdfLoading ? "Mengunduh..." : "Unduh PDF Asli"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenReader(paper, true)}
                className="btn-tactile inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#DB2777]/35 bg-[#DB2777]/12 px-3 py-1 text-xs font-medium text-[#F9A8D4] hover:border-[#F472B6] hover:bg-[#DB2777]/20"
              >
                <Languages className="h-3.5 w-3.5" />
                <span>Baca Terjemahan Full ID</span>
              </button>

              {getSafeHttpUrl(paper.landingUrl) && (
                <a
                  href={getSafeHttpUrl(paper.landingUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tactile inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1 text-xs font-medium text-[#A1A1AA] hover:text-white sm:ml-auto"
                >
                  <span>Buka Sumber Asli</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#F4F4F5]">
                Ekspor ke Dokumen Word (.docx)
              </span>
              <span className="text-[11px] font-medium text-[#A1A1AA]">
                SmartSari
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

        {/* Inline Project & Note Panel (Saved Papers) */}
        {showNotePanel && bookmarkId && onUpdateBookmarkMeta && (
          <div className="animate-panel-open mt-3 space-y-3 rounded-xl border border-[#2C2E35] border-t-2 border-t-[#DB2777]/65 bg-[#151619] p-3.5 shadow-lg">
            {projects && projects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#A1A1AA]">
                  <FolderOpen className="h-3.5 w-3.5 text-[#F472B6]" />
                  Proyek:
                </span>
                <select
                  value={projectId || ""}
                  onChange={(e) => {
                    const nextProjectId = e.target.value || null;
                    void onUpdateBookmarkMeta(bookmarkId, {
                      projectId: nextProjectId,
                    });
                  }}
                  className="rounded-lg border border-[#2C2E35] bg-[#0E0F12] px-2.5 py-1 text-xs text-[#F4F4F5] focus:border-[#F472B6] focus:outline-none"
                >
                  <option value="">Tanpa Proyek</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <textarea
                rows={2}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !savingMeta) {
                    e.preventDefault();
                    setSavingMeta(true);
                    void onUpdateBookmarkMeta(bookmarkId, {
                      note: noteDraft.trim() || null,
                    }).finally(() => setSavingMeta(false));
                  }
                }}
                placeholder="Tulis catatan riset pribadi untuk jurnal ini (metode, kutipan penting, dll)..."
                className="w-full rounded-lg border border-[#2C2E35] bg-[#0E0F12] px-3 py-2 text-xs text-[#F4F4F5] placeholder-[#71717A] focus:border-[#F472B6] focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#71717A]">
                  Ctrl+Enter untuk simpan
                </span>
                <button
                  type="button"
                  disabled={savingMeta}
                  onClick={async () => {
                    setSavingMeta(true);
                    try {
                      await onUpdateBookmarkMeta(bookmarkId, {
                        note: noteDraft.trim() || null,
                      });
                    } finally {
                      setSavingMeta(false);
                    }
                  }}
                  className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-[#DB2777] px-3.5 py-1 text-xs font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
                >
                  {savingMeta && <Loader2 className="h-3 w-3 animate-spin" />}
                  Simpan Catatan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
