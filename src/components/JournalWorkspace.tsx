"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  ChevronDown,
  ChevronUp,
  FileDown,
  FileText,
  History,
  Loader2,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { PaperCard } from "@/components/PaperCard";
import { PdfReaderModal } from "@/components/PdfReaderModal";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import {
  TIER_PRIORITY_ORDER,
  type BookmarkRecord,
  type ConversionMode,
  type ConversionRecord,
  type JournalPaper,
  type JournalTier,
  type SearchHistoryRecord,
  type SearchResponse,
  type SearchSource,
  type SortOption,
} from "@/lib/types";

type ActiveTab = "search" | "bookmarks" | "conversions" | "history";

const ALL_SOURCES: Array<{ id: SearchSource; label: string }> = [
  { id: "openalex", label: "OpenAlex" },
  { id: "europepmc", label: "Europe PMC" },
];

const RANK_SECTION_META: Record<
  JournalTier,
  { badge: string; title: string; priority?: boolean }
> = {
  Q1: {
    badge: "Q1",
    title: "Kuartil 1 Internasional · Prioritas Utama",
    priority: true,
  },
  Q2: { badge: "Q2", title: "Kuartil 2 Internasional" },
  Q3: { badge: "Q3", title: "Kuartil 3 Internasional" },
  Q4: { badge: "Q4", title: "Kuartil 4 Internasional" },
  SINTA1: { badge: "SINTA 1", title: "Jurnal Nasional Terakreditasi 1" },
  SINTA2: { badge: "SINTA 2", title: "Jurnal Nasional Terakreditasi 2" },
  SINTA3: { badge: "SINTA 3", title: "Jurnal Nasional Terakreditasi 3" },
  SINTA4: { badge: "SINTA 4", title: "Jurnal Nasional Terakreditasi 4" },
  SINTA5: { badge: "SINTA 5", title: "Jurnal Nasional Terakreditasi 5" },
  SINTA6: { badge: "SINTA 6", title: "Jurnal Nasional Terakreditasi 6" },
};

const STARTER_QUERIES = [
  "machine learning healthcare",
  "ekonomi digital UMKM",
  "renewable energy policy",
  "pendidikan karakter Indonesia",
];

const MODE_BADGE: Record<string, string> = {
  clean: "Naskah Utuh",
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

  const [query, setQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<SearchSource[]>([
    "openalex",
    "europepmc",
  ]);
  const [pdfOnly, setPdfOnly] = useState(false);
  const [yearFrom, setYearFrom] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("relevance");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [history, setHistory] = useState<SearchHistoryRecord[]>([]);
  const [conversions, setConversions] = useState<ConversionRecord[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(true);

  const [readerState, setReaderState] = useState<{
    paper: JournalPaper;
    autoTranslate: boolean;
  } | null>(null);

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
        // Non-fatal
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

  const groupedResults = useMemo(() => {
    if (!searchResult?.papers) return [];
    const buckets = new Map<JournalTier, JournalPaper[]>();
    for (const paper of searchResult.papers) {
      const tier = paper.journalMetrics?.primaryTier || "Q1";
      const list = buckets.get(tier) ?? [];
      list.push(paper);
      buckets.set(tier, list);
    }
    return TIER_PRIORITY_ORDER.filter((tier) => buckets.has(tier)).map(
      (tier) => ({
        tier,
        meta: RANK_SECTION_META[tier],
        papers: buckets.get(tier)!,
      })
    );
  }, [searchResult]);

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
        message: "Jurnal disimpan ke daftar Tersimpan Anda.",
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
        "jurnal.pdf"
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
        "jurnal.docx"
      );
      triggerBlobDownload(blob, filename);

      const isCached = res.headers.get("x-cached") === "true";
      setNotice({
        type: "success",
        message: isCached
          ? "Dokumen Word (.docx) diambil dari arsip cache dan siap diunduh."
          : "Dokumen Word (.docx) selesai dibuat.",
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
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] pb-20 md:pb-0">
      {/* Typographic Editorial Masthead */}
      <header className="sticky top-0 z-20 border-b border-[#E2DFD7] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="font-serif text-xl font-bold tracking-[-0.02em] text-[#161513] sm:text-2xl">
              PustakaCari
            </h1>
            <p className="hidden text-xs text-[#57554F] sm:block">
              Indeks Jurnal Ilmiah Q1–Q4 &amp; SINTA 1–6 · Prioritas Q1
            </p>
          </div>

          {/* Desktop Underline Navigation */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-6 md:flex"
          >
            <button
              type="button"
              onClick={() => setActiveTab("search")}
              className={`border-b-2 py-2 text-xs font-semibold transition-colors ${
                activeTab === "search"
                  ? "border-[#154033] text-[#154033]"
                  : "border-transparent text-[#57554F] hover:text-[#161513]"
              }`}
            >
              Indeks Jurnal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("bookmarks")}
              className={`border-b-2 py-2 text-xs font-semibold transition-colors ${
                activeTab === "bookmarks"
                  ? "border-[#154033] text-[#154033]"
                  : "border-transparent text-[#57554F] hover:text-[#161513]"
              }`}
            >
              Tersimpan{" "}
              <span className="font-mono tabular-nums text-[11px] text-[#78756E]">
                ({bookmarks.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("conversions")}
              className={`border-b-2 py-2 text-xs font-semibold transition-colors ${
                activeTab === "conversions"
                  ? "border-[#154033] text-[#154033]"
                  : "border-transparent text-[#57554F] hover:text-[#161513]"
              }`}
            >
              Arsip Word{" "}
              <span className="font-mono tabular-nums text-[11px] text-[#78756E]">
                ({conversions.length})
              </span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <PwaRegistrar />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-7">
        {notice && (
          <div
            role="status"
            className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm ${
              notice.type === "error"
                ? "border-[#8C3B1A]/35 bg-[#8C3B1A]/8 text-[#8C3B1A]"
                : notice.type === "success"
                  ? "border-[#154033]/30 bg-[#154033]/8 text-[#0F2E24]"
                  : "border-[#C9C4B8] bg-white text-[#161513]"
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
                  className="text-xs font-semibold underline"
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
          <div className="grid gap-8 lg:grid-cols-[1fr_270px]">
            {/* Main Search & Reading Sheet */}
            <div className="min-w-0">
              {/* Search Bar & Filters */}
              <section className="rounded-md border border-[#E2DFD7] bg-white p-3.5 sm:p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch();
                  }}
                  className="flex flex-col gap-2.5 sm:flex-row sm:gap-2.5"
                >
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78756E]" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cari topik, judul, penulis, atau DOI..."
                      className="min-h-[44px] w-full rounded-md border border-[#C9C4B8] bg-[#F8F7F4] py-2 pl-9 pr-3 text-base text-[#161513] placeholder:text-[#78756E] focus:border-[#154033] focus:bg-white focus:outline-none sm:min-h-[40px] sm:text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={searching}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-[#154033] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0F2E24] disabled:opacity-60 sm:min-h-[40px]"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {searching ? "Mencari..." : "Cari"}
                  </button>
                </form>

                {/* Mobile Filter Toggle */}
                <div className="mt-3 flex items-center justify-between border-t border-[#E2DFD7] pt-2.5 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#57554F]"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Saring &amp; Urutan
                    {showMobileFilters ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#161513]">
                    <input
                      type="checkbox"
                      checked={pdfOnly}
                      onChange={(e) => setPdfOnly(e.target.checked)}
                      className="h-4 w-4 accent-[#154033]"
                    />
                    PDF saja
                  </label>
                </div>

                {/* Understated Filter Row */}
                <div
                  className={`mt-3 flex-wrap items-center justify-between gap-3 border-t border-[#E2DFD7] pt-3 sm:flex ${
                    showMobileFilters ? "flex" : "hidden"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[#78756E]">Indeks:</span>
                    {ALL_SOURCES.map((src) => {
                      const active = selectedSources.includes(src.id);
                      return (
                        <button
                          key={src.id}
                          type="button"
                          onClick={() => toggleSource(src.id)}
                          className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "border-[#154033] bg-[#154033]/8 text-[#154033]"
                              : "border-[#E2DFD7] bg-white text-[#78756E] hover:text-[#161513]"
                          }`}
                        >
                          {src.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="hidden cursor-pointer items-center gap-1.5 text-[#161513] sm:inline-flex">
                      <input
                        type="checkbox"
                        checked={pdfOnly}
                        onChange={(e) => setPdfOnly(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#154033]"
                      />
                      PDF langsung
                    </label>

                    <select
                      aria-label="Filter tahun minimal"
                      value={yearFrom}
                      onChange={(e) => setYearFrom(e.target.value)}
                      className="min-h-[34px] rounded border border-[#C9C4B8] bg-[#F8F7F4] px-2 py-1 text-xs text-[#161513]"
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
                      className="min-h-[34px] rounded border border-[#C9C4B8] bg-[#F8F7F4] px-2 py-1 text-xs text-[#161513]"
                    >
                      <option value="relevance">Relevansi + PDF</option>
                      <option value="impact">Impact Factor</option>
                      <option value="newest">Terbaru</option>
                      <option value="citations">Sitasi Terbanyak</option>
                    </select>
                  </div>
                </div>
              </section>

              {searchError && (
                <div className="mt-4 rounded-md border border-[#8C3B1A]/35 bg-[#8C3B1A]/8 p-3.5 text-sm text-[#8C3B1A]">
                  {searchError}
                </div>
              )}

              {searching && (
                <div className="mt-6 divide-y divide-[#E2DFD7] rounded-md border border-[#E2DFD7] bg-white px-5">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="animate-pulse py-5">
                      <div className="h-4 w-20 rounded bg-[#F2EFE9]" />
                      <div className="mt-2.5 h-5 w-3/4 rounded bg-[#F2EFE9]" />
                      <div className="mt-2 h-3.5 w-1/2 rounded bg-[#F2EFE9]" />
                      <div className="mt-3 h-12 w-full rounded bg-[#F2EFE9]" />
                    </div>
                  ))}
                </div>
              )}

              {/* Grouped Archival Results */}
              {!searching && searchResult && (
                <div className="mt-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#57554F]">
                    <span>
                      Ditemukan{" "}
                      <strong className="font-mono tabular-nums text-[#161513]">
                        {searchResult.total}
                      </strong>{" "}
                      artikel untuk &ldquo;{searchResult.query}&rdquo;
                    </span>
                    <span className="font-mono text-[11px] text-[#78756E]">
                      {searchResult.sourceStats
                        .map((st) => `${st.source}: ${st.ok ? st.count : "err"}`)
                        .join(" · ")}
                    </span>
                  </div>

                  {searchResult.papers.length === 0 ? (
                    <div className="rounded-md border border-[#E2DFD7] bg-white p-8 text-center">
                      <p className="font-serif text-lg font-semibold text-[#161513]">
                        Tidak ada artikel yang cocok
                      </p>
                      <p className="mt-1 text-sm text-[#57554F]">
                        Coba gunakan kata kunci lebih umum atau matikan filter
                        PDF langsung.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {groupedResults.map((group) => (
                        <section
                          key={group.tier}
                          aria-label={group.meta.title}
                        >
                          <div
                            className={`flex items-baseline justify-between gap-3 pb-2 ${
                              group.meta.priority
                                ? "border-b-2 border-[#161513]"
                                : "border-b border-[#C9C4B8]"
                            }`}
                          >
                            <div className="flex items-baseline gap-2.5">
                              <span
                                className={`font-mono text-xs font-bold ${
                                  group.meta.priority
                                    ? "text-[#154033]"
                                    : "text-[#161513]"
                                }`}
                              >
                                {group.meta.badge}
                              </span>
                              <h2 className="font-serif text-base font-semibold text-[#161513]">
                                {group.meta.title}
                              </h2>
                            </div>
                            <span className="font-mono text-xs tabular-nums text-[#78756E]">
                              {group.papers.length} artikel
                            </span>
                          </div>

                          <div className="divide-y divide-[#E2DFD7] rounded-b-md border-x border-b border-[#E2DFD7] bg-white px-4 sm:px-5">
                            {group.papers.map((paper) => (
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
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quiet Editorial Empty State */}
              {!searching && !searchResult && (
                <div className="mt-6 rounded-md border border-[#E2DFD7] bg-white p-6 sm:p-8">
                  <h2 className="font-serif text-xl font-semibold tracking-[-0.015em] text-[#161513]">
                    Telusuri Literatur Ilmiah Terindeks
                  </h2>
                  <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-[#57554F]">
                    Hasil pencarian otomatis dikelompokkan berdasarkan peringkat
                    jurnal dengan prioritas{" "}
                    <strong className="font-semibold text-[#161513]">
                      Kuartil 1 (Q1)
                    </strong>{" "}
                    di urutan teratas, diikuti Q2–Q4 dan SINTA 1–6. Baca PDF
                    langsung atau terjemahkan ke Bahasa Indonesia dari bahasa
                    apa pun.
                  </p>
                  <div className="mt-5 border-t border-[#E2DFD7] pt-4">
                    <span className="block text-xs font-medium text-[#78756E]">
                      Contoh topik pencarian:
                    </span>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                      {STARTER_QUERIES.map((sample) => (
                        <button
                          key={sample}
                          type="button"
                          onClick={() => void runSearch(sample)}
                          className="text-sm font-medium text-[#154033] underline decoration-[#C9C4B8] underline-offset-4 transition-colors hover:decoration-[#154033]"
                        >
                          {sample}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quiet Desktop Rail */}
            <aside className="hidden space-y-7 lg:block lg:border-l lg:border-[#E2DFD7] lg:pl-6">
              <section>
                <div className="mb-3 flex items-center justify-between border-b border-[#E2DFD7] pb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#57554F]">
                    Riwayat Pencarian
                  </h2>
                  {history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleClearHistory()}
                      className="text-[11px] text-[#78756E] hover:text-[#8C3B1A]"
                    >
                      Hapus
                    </button>
                  )}
                </div>

                {loadingSidebar ? (
                  <div className="space-y-2">
                    <div className="h-6 rounded bg-[#E2DFD7]/60" />
                    <div className="h-6 rounded bg-[#E2DFD7]/60" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-xs text-[#78756E]">
                    Belum ada riwayat pencarian.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E2DFD7]">
                    {history.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => void runSearch(item.query)}
                          className="flex w-full items-center justify-between gap-2 py-2 text-left text-xs transition-colors hover:text-[#154033]"
                        >
                          <span className="truncate font-medium text-[#161513]">
                            {item.query}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-[11px] text-[#78756E]">
                            {item.resultCount}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between border-b border-[#E2DFD7] pb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#57554F]">
                    Arsip Word Terbaru
                  </h2>
                  {conversions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("conversions")}
                      className="text-[11px] font-medium text-[#154033] hover:underline"
                    >
                      Semua
                    </button>
                  )}
                </div>

                {conversions.length === 0 ? (
                  <p className="text-xs text-[#78756E]">
                    Hasil ekspor .docx tersimpan di sini.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E2DFD7]">
                    {conversions.slice(0, 5).map((conv) => (
                      <li key={conv.id} className="py-2.5">
                        <div className="line-clamp-2 font-serif text-xs font-medium leading-snug text-[#161513]">
                          {conv.title}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#78756E]">
                          <span>{MODE_BADGE[conv.mode] || conv.mode}</span>
                          <a
                            href={`/api/conversions/${conv.id}/download`}
                            className="inline-flex items-center gap-1 font-medium text-[#154033] hover:underline"
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
            <div className="mb-4 border-b border-[#161513] pb-2">
              <h2 className="font-serif text-xl font-semibold text-[#161513]">
                Jurnal Tersimpan ({bookmarks.length})
              </h2>
            </div>

            {bookmarks.length === 0 ? (
              <div className="rounded-md border border-[#E2DFD7] bg-white p-8 text-center">
                <p className="font-serif text-lg font-semibold text-[#161513]">
                  Belum ada jurnal tersimpan
                </p>
                <p className="mt-1 text-sm text-[#57554F]">
                  Klik &ldquo;Simpan&rdquo; pada artikel hasil pencarian untuk
                  menyimpannya ke koleksi Anda.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E2DFD7] rounded-md border border-[#E2DFD7] bg-white px-4 sm:px-5">
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
            <div className="mb-4 border-b border-[#161513] pb-2">
              <h2 className="font-serif text-xl font-semibold text-[#161513]">
                Arsip Konversi Word ({conversions.length})
              </h2>
            </div>

            {conversions.length === 0 ? (
              <div className="rounded-md border border-[#E2DFD7] bg-white p-8 text-center">
                <p className="font-serif text-lg font-semibold text-[#161513]">
                  Belum ada arsip konversi Word
                </p>
                <p className="mt-1 text-sm text-[#57554F]">
                  Pilih salah satu artikel lalu klik &ldquo;Ekspor Word&rdquo;
                  atau &ldquo;Terjemahkan ID&rdquo;.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E2DFD7] rounded-md border border-[#E2DFD7] bg-white px-4 sm:px-5">
                {conversions.map((conv) => (
                  <div
                    key={conv.id}
                    className="flex flex-wrap items-center justify-between gap-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#57554F]">
                        <span className="font-medium text-[#154033]">
                          {MODE_BADGE[conv.mode] || conv.mode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px]">
                          {conv.model}
                        </span>
                        {conv.year && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {conv.year}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="font-serif text-base font-semibold text-[#161513]">
                        {conv.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/conversions/${conv.id}/download`}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#154033] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0F2E24]"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        Unduh .docx
                      </a>
                      <button
                        type="button"
                        aria-label="Hapus arsip konversi"
                        onClick={() => void handleDeleteConversion(conv.id)}
                        className="min-h-[38px] rounded-md border border-[#E2DFD7] p-2 text-[#78756E] hover:border-[#8C3B1A]/40 hover:text-[#8C3B1A]"
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
            <div className="mb-4 flex items-center justify-between border-b border-[#161513] pb-2">
              <h2 className="font-serif text-xl font-semibold text-[#161513]">
                Riwayat Pencarian ({history.length})
              </h2>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearHistory()}
                  className="text-xs font-medium text-[#8C3B1A] hover:underline"
                >
                  Hapus Semua
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="rounded-md border border-[#E2DFD7] bg-white p-8 text-center">
                <p className="text-sm text-[#57554F]">
                  Belum ada riwayat pencarian.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#E2DFD7] rounded-md border border-[#E2DFD7] bg-white px-4">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void runSearch(item.query)}
                      className="flex min-h-[48px] w-full items-center justify-between py-3 text-left text-sm"
                    >
                      <span className="font-medium text-[#161513]">
                        {item.query}
                      </span>
                      <span className="font-mono text-xs text-[#78756E]">
                        {item.resultCount} hasil
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
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#E2DFD7] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-semibold ${
            activeTab === "search"
              ? "border-[#154033] text-[#154033]"
              : "border-transparent text-[#57554F]"
          }`}
        >
          <Search className="h-4 w-4" />
          Indeks
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bookmarks")}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-semibold ${
            activeTab === "bookmarks"
              ? "border-[#154033] text-[#154033]"
              : "border-transparent text-[#57554F]"
          }`}
        >
          <Bookmark className="h-4 w-4" />
          Simpan ({bookmarks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conversions")}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-semibold ${
            activeTab === "conversions"
              ? "border-[#154033] text-[#154033]"
              : "border-transparent text-[#57554F]"
          }`}
        >
          <FileText className="h-4 w-4" />
          Word ({conversions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-semibold ${
            activeTab === "history"
              ? "border-[#154033] text-[#154033]"
              : "border-transparent text-[#57554F]"
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
