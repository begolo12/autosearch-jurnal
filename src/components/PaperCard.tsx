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
  Plus,
  Quote,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
} from "lucide-react";
import { formatCitation, type CitationFormat } from "@/lib/citation";
import {
  getCachedAbstractTranslation,
  getCachedTakeaways,
  notifyQuotaUpdated,
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
  onToggleBookmark: (
    paper: JournalPaper,
    options?: { projectId?: string | null; forceSave?: boolean }
  ) => Promise<void>;
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
  onCreateProjectQuick?: (
    name: string
  ) => Promise<ResearchProjectRecord | null>;
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
  onCreateProjectQuick,
}: PaperCardProps) {
  const [expandedAbstract, setExpandedAbstract] = useState(false);
  const [showConvertPanel, setShowConvertPanel] = useState(false);
  const [showCitePanel, setShowCitePanel] = useState(false);
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const [quickProjectName, setQuickProjectName] = useState("");
  const [creatingQuickProject, setCreatingQuickProject] = useState(false);
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
      notifyQuotaUpdated();
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

  const handleSaveToTarget = async (targetProjectId: string | null) => {
    setBookmarkPending(true);
    try {
      await onToggleBookmark(paper, {
        projectId: targetProjectId,
        forceSave: true,
      });
      setShowSavePanel(false);
    } finally {
      setBookmarkPending(false);
    }
  };

  const handleRemoveBookmark = async () => {
    setBookmarkPending(true);
    try {
      await onToggleBookmark(paper);
      setShowSavePanel(false);
    } finally {
      setBookmarkPending(false);
    }
  };

  const handleQuickCreateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateProjectQuick || !quickProjectName.trim() || creatingQuickProject) {
      return;
    }
    setCreatingQuickProject(true);
    try {
      const created = await onCreateProjectQuick(quickProjectName.trim());
      if (created) {
        setQuickProjectName("");
        await onToggleBookmark(paper, {
          projectId: created.id,
          forceSave: true,
        });
        setShowSavePanel(false);
      }
    } finally {
      setCreatingQuickProject(false);
    }
  };

  const activeProjectName =
    projectId && projects
      ? projects.find((p) => p.id === projectId)?.name ?? null
      : null;

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
      notifyQuotaUpdated();
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
      ? "bg-accent text-white shadow-[0_0_12px_rgba(var(--accent-rgb),0.28)]"
      : tier === "Q2" || tier === "SINTA2"
        ? "bg-accent/15 text-accent-soft border border-accent/35"
        : "border border-line-strong bg-elevated text-ink-body";

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
    <article className="-mx-3 rounded-2xl border border-transparent px-3.5 py-5 transition-all duration-150 hover:border-line hover:bg-surface/85 sm:grid sm:grid-cols-[88px_1fr] sm:gap-5">
      {/* Left Rank Indicator */}
      <div className="mb-2 flex items-baseline gap-2.5 sm:mb-0 sm:block sm:pt-0.5">
        {tierLabel ? (
          <span
            title={
              tier?.startsWith("SINTA")
                ? paper.journalMetrics?.sintaVerified
                  ? "Terverifikasi daftar ISSN SINTA resmi"
                  : "Estimasi SINTA berdasarkan metrik indeks OpenAlex"
                : undefined
            }
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-semibold tracking-tight ${tierBadgeClass}`}
          >
            {tierLabel}
            {tier?.startsWith("SINTA") && paper.journalMetrics?.sintaVerified && (
              <Check className="h-3 w-3 shrink-0" />
            )}
          </span>
        ) : (
          <span className="inline-block rounded-md border border-line-strong bg-elevated px-2 py-0.5 font-mono text-[11px] font-medium text-ink-secondary">
            Jurnal
          </span>
        )}
        {hasImpactMetrics && paper.journalMetrics && (
          <div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-ink-secondary sm:mt-2 sm:flex-col sm:items-start sm:gap-1">
            <span className="rounded border border-line bg-canvas px-1.5 py-0.5">
              IF {paper.journalMetrics.impactFactor}
            </span>
            <span className="rounded border border-line bg-canvas px-1.5 py-0.5">
              H-{paper.journalMetrics.hIndex}
            </span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink sm:text-[17px]">
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
            className="mt-0.5 inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-2 py-1 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:bg-elevated hover:text-heading sm:min-h-0 sm:min-w-0 sm:px-1.5 sm:py-0.5"
          >
            {copiedTitle ? (
              <Check className="h-3.5 w-3.5 text-ok" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] leading-relaxed text-ink-secondary">
          {paper.pdfUrl ? (
            <span className="inline-flex items-center rounded-full border border-ok/30 bg-ok/10 px-2.5 py-0.5 text-[11px] font-medium text-ok-soft">
              PDF Akses Terbuka
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-line-strong bg-elevated px-2.5 py-0.5 text-[11px] font-medium text-ink-secondary">
              Abstrak &amp; DOI
            </span>
          )}
          <span className="min-w-0">{metaItems.join(" · ")}</span>
          {(paper.doi || getSafeHttpUrl(paper.landingUrl)) && (
            <div className="inline-flex flex-wrap items-center gap-1.5">
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
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-line-strong bg-elevated px-2.5 py-1 font-mono text-[11px] text-ink-secondary transition-colors hover:border-accent-soft/45 hover:text-heading sm:min-h-0 sm:rounded sm:px-1.5 sm:py-0.5 sm:text-[10px]"
                >
                  {copiedDoi ? (
                    <>
                      <Check className="h-2.5 w-2.5 text-ok" />
                      <span className="text-ok">DOI tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-2.5 w-2.5" />
                      <span>DOI</span>
                    </>
                  )}
                </button>
              )}
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
                className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-line-strong bg-elevated px-2.5 py-1 text-[11px] text-ink-secondary transition-colors hover:border-accent-soft/45 hover:text-heading sm:min-h-0 sm:rounded sm:px-1.5 sm:py-0.5 sm:text-[10px]"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-2.5 w-2.5 text-ok" />
                    <span className="text-ok">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-2.5 w-2.5" />
                    <span>Salin tautan</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {abstractText ? (
          <div className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-ink-body">
            <p>
              {translatedAbstract
                ? translatedAbstract.abstract
                : displayedAbstract}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {!translatedAbstract && isLongAbstract && (
                <button
                  type="button"
                  onClick={() => setExpandedAbstract((v) => !v)}
                  className="inline-flex min-h-[36px] items-center gap-0.5 rounded-md px-1 font-medium text-accent-soft hover:text-accent-tint sm:min-h-0 sm:px-0"
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
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-1 font-medium text-ink-secondary transition-colors hover:text-accent-soft disabled:opacity-60 sm:min-h-0 sm:px-0"
              >
                {translatingAbstract ? (
                  <Loader2 className="h-3 w-3 animate-spin text-accent-soft" />
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
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-1 font-medium text-ink-secondary transition-colors hover:text-accent-soft sm:min-h-0 sm:px-0"
                >
                  {copiedTranslation ? (
                    <>
                      <Check className="h-3 w-3 text-ok" />
                      <span className="text-ok">Tersalin</span>
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
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-1 font-medium text-ink-secondary transition-colors hover:text-accent-soft disabled:opacity-60 sm:min-h-0 sm:px-0"
                >
                  {loadingTakeaways ? (
                    <Loader2 className="h-3 w-3 animate-spin text-accent-soft" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-accent-soft" />
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
              <p className="mt-1 text-xs text-danger">
                {abstractTranslateErr}
              </p>
            )}
            {takeawaysErr && (
              <p className="mt-1 text-xs text-danger">{takeawaysErr}</p>
            )}
            {showTakeaways && takeaways && (
              <div className="animate-panel-open mt-2.5 rounded-xl border border-line-strong bg-surface p-3 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-1.5">
                  <span className="text-[11px] font-semibold text-accent-tint">
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
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-secondary transition-colors hover:bg-elevated hover:text-heading"
                  >
                    {copiedTakeaways ? (
                      <>
                        <Check className="h-3 w-3 text-ok" />
                        <span className="text-ok">Tersalin</span>
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
                      className="rounded-lg border border-line bg-canvas/90 p-2.5"
                    >
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-accent-soft">
                        {item.label}
                      </span>
                      <span className="leading-relaxed text-ink-strong">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-ink-muted">
            Abstrak tidak tersedia di indeks sumber.
          </p>
        )}

        {/* Action Row */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {paper.pdfUrl ? (
            <button
              type="button"
              onClick={() => onOpenReader(paper, false)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
            >
              <BookOpenText className="h-3.5 w-3.5" />
              Baca &amp; AI
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenReader(paper, true)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
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
              setShowSavePanel(false);
            }}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
              showConvertPanel
                ? "border-accent bg-accent/15 text-accent-tint"
                : "border-line-strong bg-elevated text-ink-strong hover:border-line-hover hover:text-heading"
            }`}
          >
            {isConverting || isPdfLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-soft" />
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
              setShowSavePanel(false);
            }}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              showCitePanel
                ? "border-accent bg-accent/15 text-accent-tint"
                : "border-line-strong bg-elevated text-ink-strong hover:border-line-hover hover:text-heading"
            }`}
          >
            <Quote className="h-3.5 w-3.5" />
            <span>Sitasi</span>
          </button>

          {onOpenNetwork && (
            <button
              type="button"
              onClick={() => onOpenNetwork(paper)}
              className="btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-accent-soft/45 hover:text-accent-tint"
            >
              <GitBranch className="h-3.5 w-3.5 text-accent-soft" />
              <span>Jejaring</span>
            </button>
          )}

          {onToggleSelectMatrix && (
            <button
              type="button"
              onClick={() => onToggleSelectMatrix(paper)}
              className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                selectedForMatrix
                  ? "border-accent-soft bg-accent/20 text-accent-tint"
                  : "border-line-strong bg-elevated text-ink-secondary hover:border-line-hover hover:text-heading"
              }`}
            >
              {selectedForMatrix ? (
                <CheckSquare className="h-3.5 w-3.5 text-accent-soft" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              <span>{selectedForMatrix ? "Dipilih" : "Bandingkan"}</span>
            </button>
          )}

          <button
            type="button"
            disabled={bookmarkPending}
            onClick={() => {
              setShowSavePanel((v) => !v);
              setShowConvertPanel(false);
              setShowCitePanel(false);
              setShowNotePanel(false);
            }}
            className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              isBookmarked || showSavePanel
                ? "border-accent/45 bg-accent/15 text-accent-tint"
                : "border-line-strong bg-elevated text-ink-strong hover:border-line-hover hover:text-heading"
            }`}
          >
            {bookmarkPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isBookmarked ? (
              <BookmarkCheck className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
            <span>
              {isBookmarked
                ? activeProjectName
                  ? `Tersimpan · ${activeProjectName.length > 18 ? `${activeProjectName.slice(0, 18)}…` : activeProjectName}`
                  : "Tersimpan"
                : "Simpan"}
            </span>
            {showSavePanel ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {bookmarkId && onUpdateBookmarkMeta && (
            <button
              type="button"
              onClick={() => {
                setShowNotePanel((v) => !v);
                setShowConvertPanel(false);
                setShowCitePanel(false);
                setShowSavePanel(false);
              }}
              className={`btn-tactile inline-flex min-h-[40px] sm:min-h-[34px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                showNotePanel || note || projectId
                  ? "border-accent/40 bg-accent/12 text-accent-tint"
                  : "border-line-strong bg-elevated text-ink-secondary hover:border-line-hover hover:text-heading"
              }`}
            >
              <StickyNote className="h-3.5 w-3.5" />
              <span>{note ? "Catatan ✓" : "Proyek & Catatan"}</span>
            </button>
          )}
        </div>

        {/* Inline Direct Save to Library / Research Project Picker */}
        {showSavePanel && (
          <div className="animate-panel-open mt-3 space-y-3 rounded-xl border border-line-strong border-t-2 border-t-accent/65 bg-surface p-3.5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-heading">
                Simpan ke Pustaka
              </span>
              {isBookmarked && (
                <button
                  type="button"
                  disabled={bookmarkPending}
                  onClick={() => void handleRemoveBookmark()}
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" />
                  Hapus dari Tersimpan
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bookmarkPending}
                onClick={() => void handleSaveToTarget(null)}
                className={`btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  isBookmarked && !projectId
                    ? "border-accent bg-accent/15 text-accent-tint"
                    : "border-line-strong bg-canvas text-ink-strong hover:border-accent-soft hover:text-heading"
                }`}
              >
                {isBookmarked && !projectId ? (
                  <Check className="h-3.5 w-3.5 text-accent-soft" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5 text-ink-secondary" />
                )}
                <span>Tersimpan (Umum)</span>
              </button>

              {(projects ?? []).map((p) => {
                const isCurrent = isBookmarked && projectId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={bookmarkPending}
                    onClick={() => void handleSaveToTarget(p.id)}
                    className={`btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                      isCurrent
                        ? "border-accent bg-accent/15 text-accent-tint"
                        : "border-line-strong bg-canvas text-ink-strong hover:border-accent-soft hover:text-heading"
                    }`}
                  >
                    {isCurrent ? (
                      <Check className="h-3.5 w-3.5 text-accent-soft" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 text-accent-soft" />
                    )}
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>

            {onCreateProjectQuick && (
              <form
                onSubmit={(e) => void handleQuickCreateAndSave(e)}
                className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5"
              >
                <input
                  type="text"
                  value={quickProjectName}
                  onChange={(e) => setQuickProjectName(e.target.value)}
                  placeholder="Nama proyek riset baru..."
                  maxLength={80}
                  className="min-h-[36px] min-w-[180px] flex-1 rounded-lg border border-line-strong bg-canvas px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={
                    creatingQuickProject ||
                    bookmarkPending ||
                    !quickProjectName.trim()
                  }
                  className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {creatingQuickProject ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>Buat &amp; Simpan</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Inline 1-Click Citation Panel */}
        {showCitePanel && (
          <div className="animate-panel-open mt-3 rounded-xl border border-line-strong border-t-2 border-t-accent/65 bg-surface p-3.5 shadow-lg">
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
                        ? "bg-accent text-white"
                        : "bg-elevated text-ink-secondary hover:text-heading"
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleCopyCitation()}
                className="btn-tactile inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-line-strong bg-elevated px-3 py-1 text-xs font-semibold text-ink hover:border-accent"
              >
                {copiedCite ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-ok" />
                    <span className="text-ok">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Salin Sitasi</span>
                  </>
                )}
              </button>
            </div>

            <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-body">
              {formatCitation(paper, citeFormat)}
            </pre>
          </div>
        )}

        {/* Unified Download & Word Export Panel */}
        {showConvertPanel && (
          <div className="animate-panel-open mt-3 rounded-xl border border-line-strong border-t-2 border-t-accent/65 bg-surface p-3.5 shadow-lg">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
              {paper.pdfUrl && (
                <button
                  type="button"
                  disabled={isPdfLoading}
                  onClick={() => void onDownloadPdf(paper)}
                  className="btn-tactile inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3 py-1 text-xs font-medium text-ink-strong hover:border-accent hover:text-heading disabled:opacity-60"
                >
                  {isPdfLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-soft" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 text-accent-soft" />
                  )}
                  <span>{isPdfLoading ? "Mengunduh..." : "Unduh PDF Asli"}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onOpenReader(paper, true)}
                className="btn-tactile inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-accent/35 bg-accent/12 px-3 py-1 text-xs font-medium text-accent-tint hover:border-accent-soft hover:bg-accent/20"
              >
                <Languages className="h-3.5 w-3.5" />
                <span>Baca Terjemahan Full ID</span>
              </button>

              {getSafeHttpUrl(paper.landingUrl) && (
                <a
                  href={getSafeHttpUrl(paper.landingUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-tactile inline-flex min-h-[34px] items-center gap-1 rounded-full border border-line-strong bg-elevated px-3 py-1 text-xs font-medium text-ink-secondary hover:text-heading sm:ml-auto"
                >
                  <span>Buka Sumber Asli</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink">
                Ekspor ke Dokumen Word (.docx)
              </span>
              <span className="text-[11px] font-medium text-ink-secondary">
                SmartSari by AirEvo
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
                        ? "border-accent bg-elevated"
                        : "border-line bg-canvas hover:border-line-strong"
                    }`}
                  >
                    <div className="text-xs font-semibold text-ink">
                      {opt.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-ink-secondary">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-ink-secondary">
                {paper.pdfUrl
                  ? "Teks PDF diekstrak otomatis lalu disusun menjadi berkas .docx."
                  : "PDF langsung tidak tersedia; menggunakan metadata & abstrak."}
              </p>
              <button
                type="button"
                disabled={isConverting}
                onClick={() => void onConvertWord(paper, selectedMode)}
                className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
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
          <div className="animate-panel-open mt-3 space-y-3 rounded-xl border border-line-strong border-t-2 border-t-accent/65 bg-surface p-3.5 shadow-lg">
            {projects && projects.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary">
                  <FolderOpen className="h-3.5 w-3.5 text-accent-soft" />
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
                  className="rounded-lg border border-line-strong bg-canvas px-2.5 py-1 text-xs text-ink focus:border-accent-soft focus:outline-none"
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
                className="w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-muted">
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
                  className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
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
