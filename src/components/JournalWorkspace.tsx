"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock,
  FileDown,
  FileText,
  History,
  Loader2,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { PaperCard } from "@/components/PaperCard";
import { PdfReaderModal } from "@/components/PdfReaderModal";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import type {
  BookmarkRecord,
  ConversionMode,
  ConversionRecord,
  JournalPaper,
  SearchHistoryRecord,
  SearchResponse,
  SearchSource,
  SortOption,
} from "@/lib/types";

type ActiveTab = "search" | "bookmarks" | "conversions" | "history";

const ALL_SOURCES: Array<{ id: SearchSource; label: string }> = [
  { id: "openalex", label: "OpenAlex Q1" },
  { id: "europepmc", label: "Europe PMC Q1" },
];

const STARTER_QUERIES = [
  "machine learning healthcare",
  "renewable energy policy",
  "large language models",
  "pembelajaran mesin kesehatan",
];

const MODE_BADGE: Record<string, string> = {
  clean: "Konversi Utuh",
  translate_id: "Terjemahan ID",
  summary_id: "Ringkasan ID",
};

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseFilenameFromHeader(
  header: string | null,
  fallback: string
): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallback;
}

export function JournalWorkspace() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("search");

  // Search controls
  const [query, setQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<SearchSource[]>([
    "openalex",
    "europepmc",
  ]);
  const [pdfOnly, setPdfOnly] = useState(false);
  const [yearFrom, setYearFrom] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("relevance");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Data states
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [history, setHistory] = useState<SearchHistoryRecord[]>([]);
  const [conversions, setConversions] = useState<ConversionRecord[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(true);

  // Reader modal state
  const [readerState, setReaderState] = useState<{
    paper: JournalPaper;
    autoTranslate: boolean;
  } | null>(null);

  // Action states
  const [downloadingPdfKey, setDownloadingPdfKey] = useState<string | null>(
    null
  );
  const [convertingKey, setConvertingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "info" | "error" | "success";
    message: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function initLoad() {
      try {
        const [bRes, hRes, cRes] = await Promise.all([
          fetch("/api/bookmarks"),
          fetch("/api/history"),
          fetch("/api/conversions"),
        ]);

        if (!active) return;

        if (bRes.ok) {
          const bJson = (await bRes.json()) as { bookmarks?: BookmarkRecord[] };
          setBookmarks(bJson.bookmarks ?? []);
        }
        if (hRes.ok) {
          const hJson = (await hRes.json()) as {
            history?: SearchHistoryRecord[];
          };
          setHistory(hJson.history ?? []);
        }
        if (cRes.ok) {
          const cJson = (await cRes.json()) as {
            conversions?: ConversionRecord[];
          };
          setConversions(cJson.conversions ?? []);
        }
      } catch {
        // Non-fatal on initial load
      } finally {
        if (active) setLoadingSidebar(false);
      }
    }
    void initLoad();
    return () => {
      active = false;
    };
  }, []);

  const bookmarkedMap = useMemo(() => {
    const map = new Map<string, BookmarkRecord>();
    for (const b of bookmarks) {
      map.set(b.paperKey, b);
    }
    return map;
  }, [bookmarks]);

  const runSearch = useCallback(
    async (overrideQuery?: string) => {
      const q = (overrideQuery ?? query).trim();
      if (q.length < 2) {
        setSearchError("Masukkan kata kunci minimal 2 karakter.");
        return;
      }
      if (overrideQuery !== undefined) {
        setQuery(overrideQuery);
      }

      setActiveTab("search");
      setSearching(true);
      setSearchError(null);
      setNotice(null);

      try {
        const params = new URLSearchParams();
        params.set("q", q);
        if (selectedSources.length > 0 && selectedSources.length < 2) {
          params.set("sources", selectedSources.join(","));
        }
        if (pdfOnly) params.set("pdfOnly", "true");
        if (yearFrom) params.set("yearFrom", yearFrom);
        params.set("sort", sort);

        const res = await fetch(`/api/search?${params.toString()}`);
        const data = (await res.json()) as SearchResponse & { error?: string };

        if (!res.ok) {
          setSearchError(data.error || "Pencarian gagal dijalankan.");
          return;
        }

        setSearchResult(data);
        const hRes = await fetch("/api/history");
        if (hRes.ok) {
          const hJson = (await hRes.json()) as {
            history?: SearchHistoryRecord[];
          };
          setHistory(hJson.history ?? []);
        }
      } catch {
        setSearchError("Tidak dapat terhubung ke server pencarian.");
      } finally {
        setSearching(false);
      }
    },
    [query, selectedSources, pdfOnly, yearFrom, sort]
  );

  const toggleSource = (source: SearchSource) => {
    setSelectedSources((prev) => {
      if (prev.includes(source)) {
        return prev.length > 1 ? prev.filter((s) => s !== source) : prev;
      }
      return [...prev, source];
    });
  };

  const handleToggleBookmark = async (paper: JournalPaper) => {
    const existing = bookmarkedMap.get(paper.paperKey);
    if (existing) {
      const res = await fetch(`/api/bookmarks/${existing.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        setNotice({
          type: "info",
          message: "Jurnal dihapus dari daftar Tersimpan.",
        });
      }
      return;
    }

    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paper),
    });

    if (res.ok) {
      const data = (await res.json()) as { bookmark: BookmarkRecord };
      setBookmarks((prev) => [data.bookmark, ...prev]);
      setNotice({
        type: "success",
        message: "Jurnal Q1 disimpan ke daftar Tersimpan Anda.",
      });
    } else {
      setNotice({
        type: "error",
        message: "Gagal menyimpan jurnal.",
      });
    }
  };

  const handleDownloadPdf = async (paper: JournalPaper) => {
    if (!paper.pdfUrl) return;
    setDownloadingPdfKey(paper.paperKey);
    setNotice(null);

    try {
      const params = new URLSearchParams({
        url: paper.pdfUrl,
        title: paper.title,
      });
      if (paper.doi) params.set("doi", paper.doi);
      const res = await fetch(`/api/pdf/download?${params.toString()}`);

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          fallbackUrl?: string;
        };
        setNotice({
          type: "error",
          message:
            err.error ||
            "PDF tidak dapat diunduh otomatis karena pembatasan penerbit.",
          actionUrl: err.fallbackUrl || paper.landingUrl || paper.pdfUrl,
          actionLabel: "Buka di Tab Baru",
        });
        return;
      }

      const blob = await res.blob();
      const filename = parseFilenameFromHeader(
        res.headers.get("content-disposition"),
        "jurnal-q1.pdf"
      );
      triggerBlobDownload(blob, filename);
      setNotice({
        type: "success",
        message: `PDF "${paper.title.slice(0, 48)}..." berhasil diunduh.`,
      });
    } catch {
      setNotice({
        type: "error",
        message: "Koneksi gagal saat mengunduh PDF.",
        actionUrl: paper.pdfUrl,
        actionLabel: "Buka Tautan Asli",
      });
    } finally {
      setDownloadingPdfKey(null);
    }
  };

  const handleConvertWord = async (
    paper: JournalPaper,
    mode: ConversionMode
  ) => {
    setConvertingKey(paper.paperKey);
    setNotice(null);

    try {
      const res = await fetch("/api/convert", {
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
          mode,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setNotice({
          type: "error",
          message:
            err.error || "Gagal mengonversi jurnal ke dokumen Word (.docx).",
        });
        return;
      }

      const blob = await res.blob();
      const filename = parseFilenameFromHeader(
        res.headers.get("content-disposition"),
        "jurnal-q1.docx"
      );
      triggerBlobDownload(blob, filename);

      const isCached = res.headers.get("x-cached") === "true";
      setNotice({
        type: "success",
        message: isCached
          ? "Dokumen Word (.docx) diambil dari cache dan siap diunduh."
          : "Dokumen Word (.docx) selesai dibuat oleh AI!",
      });

      const cRes = await fetch("/api/conversions");
      if (cRes.ok) {
        const cJson = (await cRes.json()) as {
          conversions?: ConversionRecord[];
        };
        setConversions(cJson.conversions ?? []);
      }
    } catch {
      setNotice({
        type: "error",
        message: "Terjadi gangguan jaringan saat mengonversi ke Word.",
      });
    } finally {
      setConvertingKey(null);
    }
  };

  const handleClearHistory = async () => {
    const res = await fetch("/api/history", { method: "DELETE" });
    if (res.ok) {
      setHistory([]);
    }
  };

  const handleDeleteConversion = async (id: string) => {
    const res = await fetch(`/api/conversions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConversions((prev) => prev.filter((c) => c.id !== id));
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      {/* Top Masthead */}
      <header className="sticky top-0 z-20 border-b border-[#E5DFD5] bg-[#FAF8F4]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1B4D3E] text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-lg font-bold tracking-tight text-[#1C1917] sm:text-xl">
                  PustakaCari
                </h1>
                <span className="rounded bg-[#1B4D3E] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                  Q1 ONLY
                </span>
              </div>
              <p className="hidden text-xs text-[#57534E] sm:block">
                Jurnal Ilmiah Q1 Terverifikasi · Baca PDF &amp; Terjemahan Otomatis
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-1 rounded-lg border border-[#E5DFD5] bg-[#F2EFE9] p-1 md:flex"
          >
            <button
              type="button"
              onClick={() => setActiveTab("search")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "search"
                  ? "bg-white text-[#1C1917]"
                  : "text-[#57534E] hover:text-[#1C1917]"
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Pencarian Q1
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bookmarks")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "bookmarks"
                  ? "bg-white text-[#1C1917]"
                  : "text-[#57534E] hover:text-[#1C1917]"
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Tersimpan
              <span className="font-mono tabular-nums text-[11px] text-[#57534E]">
                ({bookmarks.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("conversions")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "conversions"
                  ? "bg-white text-[#1C1917]"
                  : "text-[#57534E] hover:text-[#1C1917]"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Riwayat Word
              <span className="font-mono tabular-nums text-[11px] text-[#57534E]">
                ({conversions.length})
              </span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <PwaRegistrar />
            <span className="hidden items-center gap-1 rounded-md border border-[#E5DFD5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1B4D3E] lg:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Filter Q1 Aktif
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6 sm:py-6">
        {notice && (
          <div
            role="status"
            className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-[#9A3412]/30 bg-[#9A3412]/8 text-[#7C2D12]"
                : notice.type === "success"
                  ? "border-[#1B4D3E]/30 bg-[#1B4D3E]/8 text-[#143B2F]"
                  : "border-[#CFC6B8] bg-[#F2EFE9] text-[#1C1917]"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{notice.message}</span>
            </div>
            <div className="flex items-center gap-2">
              {notice.actionUrl && (
                <a
                  href={notice.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] underline"
                >
                  {notice.actionLabel || "Buka"}
                </a>
              )}
              <button
                type="button"
                aria-label="Tutup pemberitahuan"
                onClick={() => setNotice(null)}
                className="rounded p-1 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "search" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            {/* Main Search Column */}
            <div>
              <section className="rounded-xl border border-[#E5DFD5] bg-white p-3.5 sm:p-5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch();
                  }}
                  className="flex flex-col gap-2.5 sm:flex-row sm:gap-3"
                >
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cari jurnal Q1 (Bahasa Indonesia / Inggris)..."
                      className="min-h-[44px] w-full rounded-lg border border-[#CFC6B8] bg-[#FAF8F4] py-2.5 pl-10 pr-4 text-base text-[#1C1917] placeholder:text-[#78716C] focus:border-[#1B4D3E] focus:bg-white focus:outline-none sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searching}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#1B4D3E] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#143B2F] disabled:opacity-60"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {searching ? "Mencari Q1..." : "Cari Jurnal Q1"}
                  </button>
                </form>

                {/* Mobile Filter Toggle */}
                <div className="mt-3 flex items-center justify-between border-t border-[#F2EFE9] pt-2.5 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#57534E]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filter &amp; Urutan Q1
                    {showMobileFilters ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#1C1917]">
                    <input
                      type="checkbox"
                      checked={pdfOnly}
                      onChange={(e) => setPdfOnly(e.target.checked)}
                      className="h-4 w-4 accent-[#1B4D3E]"
                    />
                    PDF saja
                  </label>
                </div>

                {/* Filter Controls (always visible on sm+, toggleable on mobile) */}
                <div
                  className={`mt-3 flex-wrap items-center justify-between gap-3 border-t border-[#F2EFE9] pt-3.5 sm:mt-4 sm:flex ${
                    showMobileFilters ? "flex" : "hidden"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-[#57534E]">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Indeks Q1:
                    </span>
                    {ALL_SOURCES.map((src) => {
                      const active = selectedSources.includes(src.id);
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => toggleSource(src.id)}
                          className={`min-h-[34px] rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "border-[#1B4D3E] bg-[#1B4D3E]/10 text-[#1B4D3E]"
                              : "border-[#E5DFD5] bg-[#FAF8F4] text-[#57534E]"
                          }`}
                        >
                          {src.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="hidden cursor-pointer items-center gap-1.5 text-[#1C1917] sm:inline-flex">
                      <input
                        type="checkbox"
                        checked={pdfOnly}
                        onChange={(e) => setPdfOnly(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#1B4D3E]"
                      />
                      Hanya PDF langsung
                    </label>

                    <select
                      aria-label="Filter tahun minimal"
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value)}
                      className="min-h-[36px] rounded-md border border-[#CFC6B8] bg-[#FAF8F4] px-2.5 py-1 text-xs text-[#1C1917]"
                    >
                      <option value="">Semua Tahun</option>
                      <option value="2024">Sejak 2024</option>
                      <option value="2022">Sejak 2022</option>
                      <option value="2020">Sejak 2020</option>
                      <option value="2015">Sejak 2015</option>
                    </select>

                    <select
                      aria-label="Urutkan hasil"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortOption)}
                      className="min-h-[36px] rounded-md border border-[#CFC6B8] bg-[#FAF8F4] px-2.5 py-1 text-xs text-[#1C1917]"
                    >
                      <option value="relevance">Relevansi + PDF</option>
                      <option value="impact">Impact Factor Tertinggi</option>
                      <option value="newest">Terbaru</option>
                      <option value="citations">Sitasi Terbanyak</option>
                    </select>
                  </div>
                </div>
              </section>

              {searchError && (
                <div className="mt-4 rounded-xl border border-[#9A3412]/30 bg-[#9A3412]/8 p-4 text-sm text-[#7C2D12]">
                  {searchError}
                </div>
              )}

              {searching && (
                <div className="mt-5 space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="animate-pulse rounded-xl border border-[#E5DFD5] bg-white p-5"
                    >
                      <div className="mb-3 flex gap-2">
                        <div className="h-5 w-12 rounded bg-[#F2EFE9]" />
                        <div className="h-5 w-24 rounded bg-[#F2EFE9]" />
                      </div>
                      <div className="h-6 w-3/4 rounded bg-[#F2EFE9]" />
                      <div className="mt-2 h-4 w-1/2 rounded bg-[#F2EFE9]" />
                      <div className="mt-4 h-14 w-full rounded bg-[#F2EFE9]" />
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchResult && (
                <div className="mt-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#57534E]">
                    <span>
                      Menampilkan{" "}
                      <strong className="font-mono tabular-nums text-[#1C1917]">
                        {searchResult.total}
                      </strong>{" "}
                      jurnal Q1 untuk &ldquo;{searchResult.query}&rdquo;
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {searchResult.sourceStats.map((st) => (
                        <span
                          key={st.source}
                          className="rounded border border-[#E5DFD5] bg-white px-2 py-0.5 font-mono text-[11px]"
                        >
                          {st.source}: {st.ok ? st.count : "err"}
                        </span>
                      ))}
                    </div>
                  </div>

                  {searchResult.papers.length === 0 ? (
                    <div className="rounded-xl border border-[#E5DFD5] bg-white p-6 text-center sm:p-8">
                      <p className="font-serif text-lg font-semibold text-[#1C1917]">
                        Tidak ada jurnal Q1 yang cocok
                      </p>
                      <p className="mt-1 text-sm text-[#57534E]">
                        Karena pencarian dikhususkan untuk jurnal Q1 bereputasi
                        tinggi, coba gunakan kata kunci berbahasa Inggris atau
                        matikan filter &ldquo;Hanya PDF langsung&rdquo;.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {searchResult.papers.map((paper) => (
                        <PaperCard
                          key={paper.paperKey}
                          paper={paper}
                          isBookmarked={bookmarkedMap.has(paper.paperKey)}
                          onToggleBookmark={handleToggleBookmark}
                          onDownloadPdf={handleDownloadPdf}
                          onOpenReader={(p, autoTranslate = false) =>
                            setReaderState({ paper: p, autoTranslate })
                          }
                          onConvertWord={handleConvertWord}
                          downloadingPdfKey={downloadingPdfKey}
                          convertingKey={convertingKey}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!searching && !searchResult && (
                <div className="mt-5 rounded-xl border border-[#E5DFD5] bg-white p-5 sm:p-8">
                  <h2 className="font-serif text-lg font-semibold text-[#1C1917]">
                    Telusuri Jurnal Ilmiah Q1 Terverifikasi
                  </h2>
                  <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-[#57534E]">
                    Semua hasil disaring otomatis hanya dari jurnal peer-review
                    kuartil 1 (Q1) berdasarkan metrik Impact Factor &amp;
                    h-index. Anda dapat membaca PDF langsung di aplikasi,
                    menerjemahkan otomatis dari bahasa apa pun ke Bahasa
                    Indonesia, dan mengunduh versi Word (.docx).
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {STARTER_QUERIES.map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => void runSearch(sample)}
                        className="min-h-[38px] rounded-lg border border-[#CFC6B8] bg-[#FAF8F4] px-3 py-1.5 text-xs font-medium text-[#1C1917] transition-colors hover:border-[#1B4D3E] hover:bg-[#1B4D3E]/8 hover:text-[#1B4D3E]"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Right Sidebar */}
            <aside className="hidden space-y-5 lg:block">
              <section className="rounded-xl border border-[#E5DFD5] bg-[#F2EFE9]/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#57534E]">
                    <History className="h-3.5 w-3.5 text-[#1B4D3E]" />
                    Riwayat Pencarian
                  </h2>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleClearHistory()}
                      className="text-[11px] font-medium text-[#78716C] hover:text-[#9A3412]"
                    >
                      Bersihkan
                    </button>
                  )}
                </div>

                {loadingSidebar ? (
                  <div className="space-y-2">
                    <div className="h-8 rounded bg-[#E5DFD5]/70" />
                    <div className="h-8 rounded bg-[#E5DFD5]/70" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-[#57534E]">
                    Belum ada riwayat pencarian Anda.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {history.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => void runSearch(item.query)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent bg-white px-3 py-2 text-left text-xs transition-colors hover:border-[#CFC6B8]"
                        >
                          <span className="truncate font-medium text-[#1C1917]">
                            {item.query}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-[11px] text-[#78716C]">
                            {item.resultCount}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-[#E5DFD5] bg-[#F2EFE9]/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#57534E]">
                    <Clock className="h-3.5 w-3.5 text-[#9A3412]" />
                    Konversi Word Terbaru
                  </h2>
                  {conversions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("conversions")}
                      className="text-[11px] font-medium text-[#1B4D3E] hover:underline"
                    >
                      Lihat semua
                    </button>
                  )}
                </div>

                {conversions.length === 0 ? (
                  <p className="text-xs text-[#57534E]">
                    Hasil konversi &amp; terjemahan .docx Anda tersimpan di sini.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {conversions.slice(0, 5).map((conv) => (
                      <li
                        key={conv.id}
                        className="rounded-lg border border-[#E5DFD5] bg-white p-2.5"
                      >
                        <div className="line-clamp-2 font-serif text-xs font-semibold text-[#1C1917]">
                          {conv.title}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="rounded bg-[#FAF8F4] px-1.5 py-0.5 text-[10px] font-medium text-[#57534E]">
                            {MODE_BADGE[conv.mode] || conv.mode}
                          </span>
                          <a
                            href={`/api/conversions/${conv.id}/download`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B4D3E] hover:underline"
                          >
                            <FileDown className="h-3 w-3" />
                            .docx
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        )}

        {activeTab === "bookmarks" && (
          <section>
            <h2 className="mb-4 font-serif text-xl font-semibold text-[#1C1917]">
              Jurnal Q1 Tersimpan ({bookmarks.length})
            </h2>

            {bookmarks.length === 0 ? (
              <div className="rounded-xl border border-[#E5DFD5] bg-white p-8 text-center">
                <p className="font-serif text-lg font-semibold text-[#1C1917]">
                  Belum ada jurnal tersimpan
                </p>
                <p className="mt-1 text-sm text-[#57534E]">
                  Klik tombol &ldquo;Simpan&rdquo; pada hasil pencarian untuk
                  menyimpannya ke koleksi pribadi Anda.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {bookmarks.map((b) => (
                  <PaperCard
                    key={b.id}
                    paper={{
                      paperKey: b.paperKey,
                      title: b.title,
                      authors: b.authors,
                      year: b.year,
                      venue: b.venue,
                      source: b.source as SearchSource,
                      abstract: b.abstract,
                      pdfUrl: b.pdfUrl,
                      landingUrl: b.landingUrl,
                      doi: b.doi,
                      citations: b.citations,
                      openAccess: Boolean(b.pdfUrl),
                    }}
                    isBookmarked={true}
                    onToggleBookmark={handleToggleBookmark}
                    onDownloadPdf={handleDownloadPdf}
                    onOpenReader={(p, autoTranslate = false) =>
                      setReaderState({ paper: p, autoTranslate })
                    }
                    onConvertWord={handleConvertWord}
                    downloadingPdfKey={downloadingPdfKey}
                    convertingKey={convertingKey}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "conversions" && (
          <section>
            <h2 className="mb-4 font-serif text-xl font-semibold text-[#1C1917]">
              Riwayat Konversi &amp; Terjemahan Word ({conversions.length})
            </h2>

            {conversions.length === 0 ? (
              <div className="rounded-xl border border-[#E5DFD5] bg-white p-8 text-center">
                <p className="font-serif text-lg font-semibold text-[#1C1917]">
                  Belum ada riwayat konversi Word
                </p>
                <p className="mt-1 text-sm text-[#57534E]">
                  Pilih salah satu jurnal Q1 lalu klik &ldquo;Convert Word&rdquo;
                  atau &ldquo;Terjemahkan ID&rdquo;.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {conversions.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E5DFD5] bg-white p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded bg-[#9A3412]/10 px-2 py-0.5 font-medium text-[#9A3412]">
                          {MODE_BADGE[conv.mode] || conv.mode}
                        </span>
                        <span className="font-mono text-[11px] text-[#57534E]">
                          {conv.model}
                        </span>
                        {conv.year && (
                          <span className="font-mono tabular-nums text-[#78716C]">
                            {conv.year}
                          </span>
                        )}
                      </div>
                      <h3 className="font-serif text-base font-semibold text-[#1C1917]">
                        {conv.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/conversions/${conv.id}/download`}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#143B2F]"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Unduh .docx
                      </a>
                      <button
                        type="button"
                        aria-label="Hapus riwayat konversi"
                        onClick={() => void handleDeleteConversion(conv.id)}
                        className="min-h-[40px] rounded-lg border border-[#E5DFD5] p-2 text-[#78716C] hover:border-[#9A3412]/40 hover:text-[#9A3412]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
                Riwayat Pencarian ({history.length})
              </h2>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearHistory()}
                  className="text-xs font-medium text-[#9A3412] hover:underline"
                >
                  Bersihkan Semua
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="rounded-xl border border-[#E5DFD5] bg-white p-8 text-center">
                <p className="text-sm text-[#57534E]">
                  Belum ada riwayat pencarian.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void runSearch(item.query)}
                      className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-[#E5DFD5] bg-white px-4 py-3 text-left text-sm"
                    >
                      <span className="font-medium text-[#1C1917]">
                        {item.query}
                      </span>
                      <span className="font-mono text-xs text-[#57534E]">
                        {item.resultCount} Q1
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {/* Mobile Sticky Bottom Navigation */}
      <nav
        aria-label="Navigasi seluler"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#E5DFD5] bg-[#FAF8F4]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "search" ? "text-[#1B4D3E]" : "text-[#57534E]"
          }`}
        >
          <Search className="h-4 w-4" />
          Cari Q1
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bookmarks")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "bookmarks" ? "text-[#1B4D3E]" : "text-[#57534E]"
          }`}
        >
          <Bookmark className="h-4 w-4" />
          Simpan ({bookmarks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conversions")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "conversions" ? "text-[#1B4D3E]" : "text-[#57534E]"
          }`}
        >
          <FileText className="h-4 w-4" />
          Word ({conversions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            activeTab === "history" ? "text-[#1B4D3E]" : "text-[#57534E]"
          }`}
        >
          <History className="h-4 w-4" />
          Riwayat
        </button>
      </nav>

      {/* In-App PDF Reader & Universal Auto-Translate Modal */}
      {readerState && (
        <PdfReaderModal
          paper={readerState.paper}
          initialTranslate={readerState.autoTranslate}
          onClose={() => setReaderState(null)}
          onDownloadPdf={handleDownloadPdf}
          onDownloadTranslatedDocx={(p) =>
            handleConvertWord(p, "translate_id")
          }
        />
      )}
    </div>
  );
}
