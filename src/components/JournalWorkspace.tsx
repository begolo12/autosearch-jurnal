"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Bookmark,
  FileDown,
  FileText,
  History,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { PaperCard } from "@/components/PaperCard";
import { PdfReaderModal } from "@/components/PdfReaderModal";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { formatRelativeTimeId } from "@/lib/citation";
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

const STARTER_SUGGESTIONS = [
  {
    query: "machine learning healthcare",
    label: "Cari riset Machine Learning Kesehatan (Q1–Q4)",
    icon: BookOpen,
  },
  {
    query: "ekonomi digital UMKM",
    label: "Telusuri jurnal Ekonomi Digital & UMKM (SINTA & Q1)",
    icon: Search,
  },
  {
    query: "renewable energy policy",
    label: "Temukan PDF Energi Terbarukan & terjemahkan ke Indonesia",
    icon: FileText,
  },
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSidebarSearch, setShowSidebarSearch] = useState(false);

  const [query, setQuery] = useState("");
  const [selectedSources, setSelectedSources] = useState<SearchSource[]>([
    "openalex",
    "europepmc",
  ]);
  const [pdfOnly, setPdfOnly] = useState(false);
  const [yearFrom, setYearFrom] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("relevance");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [history, setHistory] = useState<SearchHistoryRecord[]>([]);
  const [conversions, setConversions] = useState<ConversionRecord[]>([]);
  const [loadingSidebar, setLoadingSidebar] = useState(true);

  const [historyFilter, setHistoryFilter] = useState("");
  const [bookmarksFilter, setBookmarksFilter] = useState("");
  const [conversionsFilter, setConversionsFilter] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sidebarSearchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setActiveTab("search");
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 10);
      } else if (e.key === "/" && !inEditable && !readerState) {
        e.preventDefault();
        setActiveTab("search");
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 10);
      }
    };

    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 450);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [readerState]);

  const filteredHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => item.query.toLowerCase().includes(q));
  }, [history, historyFilter]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarksFilter.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.venue || "").toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q))
    );
  }, [bookmarks, bookmarksFilter]);

  const filteredConversions = useMemo(() => {
    const q = conversionsFilter.trim().toLowerCase();
    if (!q) return conversions;
    return conversions.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversions, conversionsFilter]);

  const bookmarkedMap = useMemo(() => {
    const map = new Map<string, BookmarkRecord>();
    for (const b of bookmarks) {
      map.set(b.paperKey, b);
    }
    return map;
  }, [bookmarks]);

  const runSearch = useCallback(
    async (overrideQuery?: string, overridePdfOnly?: boolean) => {
      const q = (overrideQuery ?? query).trim();
      if (q.length < 2) {
        setSearchError("Masukkan kata kunci minimal 2 karakter.");
        return;
      }
      if (overrideQuery !== undefined) {
        setQuery(overrideQuery);
      }

      const effectivePdfOnly = overridePdfOnly ?? pdfOnly;

      setActiveTab("search");
      setShowFilterMenu(false);
      setSearching(true);
      setSearchError(null);
      setNotice(null);

      try {
        const params = new URLSearchParams();
        params.set("q", q);
        if (selectedSources.length > 0 && selectedSources.length < 2) {
          params.set("sources", selectedSources.join(","));
        }
        if (effectivePdfOnly) params.set("pdfOnly", "true");
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

  const handleDeleteHistoryItem = async (id: string) => {
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (res.ok) {
      setHistory((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleDeleteConversion = async (id: string) => {
    const res = await fetch(`/api/conversions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setConversions((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const isLanding = activeTab === "search" && !searching && !searchResult;

  const renderPillSearchBar = (compact = false) => (
    <div className="relative mx-auto w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        className={`flex items-center gap-2 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-2.5 transition-all duration-150 focus-within:border-[#DB2777]/70 focus-within:ring-2 focus-within:ring-[#DB2777]/20 ${
          compact ? "min-h-[46px] py-1" : "min-h-[54px] py-1.5"
        }`}
      >
        <button
          type="button"
          aria-label="Filter indeks dan tahun"
          onClick={() => setShowFilterMenu((v) => !v)}
          className={`btn-tactile inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            showFilterMenu || yearFrom || selectedSources.length < 2
              ? "bg-[#DB2777]/20 text-[#F472B6]"
              : "text-[#A1A1AA] hover:bg-[#2C2E35] hover:text-white"
          }`}
        >
          <Plus className="h-4 w-4" />
        </button>

        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari jurnal Q1–Q4, SINTA 1–6, atau DOI..."
          className="min-w-0 flex-1 bg-transparent text-base text-[#F4F4F5] placeholder:text-[#71717A] focus:outline-none sm:text-sm"
        />

        <select
          aria-label="Urutkan hasil"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="hidden cursor-pointer rounded-full bg-transparent px-2 py-1 text-xs font-medium text-[#A1A1AA] hover:text-white focus:outline-none sm:block"
        >
          <option value="relevance" className="bg-[#151619] text-[#F4F4F5]">
            Relevansi
          </option>
          <option value="impact" className="bg-[#151619] text-[#F4F4F5]">
            Impact Factor
          </option>
          <option value="newest" className="bg-[#151619] text-[#F4F4F5]">
            Terbaru
          </option>
          <option value="citations" className="bg-[#151619] text-[#F4F4F5]">
            Sitasi
          </option>
        </select>

        <button
          type="submit"
          disabled={searching}
          aria-label="Cari jurnal"
          className="btn-tactile inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DB2777] text-white hover:bg-[#BE185D] disabled:opacity-60"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>

      {/* Filter Popover */}
      {showFilterMenu && (
        <div className="animate-panel-open absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-[#2C2E35] bg-[#151619] p-4 shadow-2xl sm:right-auto sm:w-80">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F4F4F5]">
              Filter Pencarian
            </span>
            <button
              type="button"
              onClick={() => setShowFilterMenu(false)}
              className="text-[#71717A] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="mb-1.5 block text-[11px] text-[#A1A1AA]">
                Sumber Indeks
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ALL_SOURCES.map((src) => {
                  const active = selectedSources.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => toggleSource(src.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-[#DB2777] bg-[#DB2777]/15 text-[#F472B6]"
                          : "border-[#2C2E35] bg-[#1E1F23] text-[#A1A1AA] hover:text-white"
                      }`}
                    >
                      {src.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="mb-1 block text-[11px] text-[#A1A1AA]">
                  Tahun Minimal
                </span>
                <select
                  aria-label="Filter tahun minimal"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-full rounded-lg border border-[#2C2E35] bg-[#1E1F23] px-2.5 py-1.5 text-xs text-[#F4F4F5]"
                >
                  <option value="">Semua Tahun</option>
                  <option value="2024">Sejak 2024</option>
                  <option value="2022">Sejak 2022</option>
                  <option value="2020">Sejak 2020</option>
                  <option value="2015">Sejak 2015</option>
                </select>
              </div>

              <div className="sm:hidden">
                <span className="mb-1 block text-[11px] text-[#A1A1AA]">
                  Urutkan
                </span>
                <select
                  aria-label="Urutkan hasil seluler"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  className="w-full rounded-lg border border-[#2C2E35] bg-[#1E1F23] px-2.5 py-1.5 text-xs text-[#F4F4F5]"
                >
                  <option value="relevance">Relevansi</option>
                  <option value="impact">Impact Factor</option>
                  <option value="newest">Terbaru</option>
                  <option value="citations">Sitasi</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0E0F12] text-[#F4F4F5] pb-16 md:pb-0">
      {/* Collapsible Left Sidebar (Reference-Faithful) */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-[#232429] bg-[#151619] transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-screen ${
          sidebarOpen ? "w-[264px]" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        {/* Sidebar Top Header */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab("search");
              setSearchResult(null);
              setQuery("");
            }}
            className="flex items-center gap-2 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt="SmartSari"
              className="h-6 w-6 object-contain drop-shadow-[0_0_8px_rgba(244,114,182,0.35)]"
            />
            <span className="text-sm font-semibold tracking-[-0.01em] text-[#F4F4F5]">
              Smart<span className="text-[#F472B6]">Sari</span>
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Cari riwayat"
              onClick={() => {
                setShowSidebarSearch((v) => !v);
                setTimeout(() => sidebarSearchRef.current?.focus(), 20);
              }}
              className="rounded-lg p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#232429] hover:text-white"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Tutup sidebar"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#232429] hover:text-white"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quiet Pill Navigation */}
        <nav aria-label="Menu utama" className="space-y-0.5 px-2.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab("search");
              setSearchResult(null);
              setQuery("");
            }}
            className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === "search" && !searchResult
                ? "bg-[#232429] text-white"
                : "text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white"
            }`}
          >
            <SquarePen className="h-4 w-4 text-[#F472B6]" />
            <span>Pencarian Baru</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bookmarks")}
            className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === "bookmarks"
                ? "bg-[#232429] text-white"
                : "text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Bookmark className="h-4 w-4" />
              Tersimpan
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[#71717A]">
              {bookmarks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("conversions")}
            className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === "conversions"
                ? "bg-[#232429] text-white"
                : "text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <FileText className="h-4 w-4" />
              Arsip Word
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[#71717A]">
              {conversions.length}
            </span>
          </button>
        </nav>

        {/* Flat Arsip Word & Searchable History */}
        <div className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {conversions.length > 0 && (
            <section>
              <div className="mb-1.5 px-1 text-[11px] font-medium text-[#71717A]">
                Arsip Word
              </div>
              <ul className="space-y-0.5">
                {conversions.slice(0, 4).map((conv) => (
                  <li key={conv.id}>
                    <a
                      href={`/api/conversions/${conv.id}/download`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[#D4D4D8] transition-colors hover:bg-[#1E1F23] hover:text-white"
                    >
                      <FileDown className="h-3.5 w-3.5 shrink-0 text-[#F472B6]" />
                      <span className="truncate">{conv.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-[#71717A]">
                Riwayat
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleClearHistory()}
                  className="text-[11px] text-[#71717A] hover:text-[#F87171]"
                >
                  Hapus
                </button>
              )}
            </div>

            {(showSidebarSearch || history.length > 3) && (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#71717A]" />
                <input
                  ref={sidebarSearchRef}
                  type="search"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  placeholder="Cari riwayat..."
                  className="w-full rounded-lg border border-[#232429] bg-[#0E0F12] py-1.5 pl-7 pr-2 text-xs text-[#F4F4F5] placeholder:text-[#71717A] focus:border-[#DB2777] focus:outline-none"
                />
              </div>
            )}

            {loadingSidebar ? (
              <div className="space-y-1.5 px-1">
                <div className="h-5 rounded bg-[#1E1F23]" />
                <div className="h-5 rounded bg-[#1E1F23]" />
              </div>
            ) : history.length === 0 ? (
              <p className="px-1 text-xs text-[#71717A]">
                Belum ada riwayat.
              </p>
            ) : filteredHistory.length === 0 ? (
              <p className="px-1 text-[11px] text-[#71717A]">
                Tidak cocok dengan &ldquo;{historyFilter}&rdquo;.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredHistory.slice(0, 14).map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#1E1F23]"
                  >
                    <button
                      type="button"
                      onClick={() => void runSearch(item.query)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs text-[#D4D4D8] group-hover:text-white"
                    >
                      <span className="truncate">{item.query}</span>
                      <span className="shrink-0 font-mono text-[10px] text-[#71717A]">
                        {formatRelativeTimeId(item.createdAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus riwayat ${item.query}`}
                      onClick={() => void handleDeleteHistoryItem(item.id)}
                      className="shrink-0 rounded p-0.5 text-[#71717A] opacity-0 transition-opacity hover:text-[#F87171] group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>

      {/* Main Workspace */}
      <div
        className={`flex min-w-0 flex-1 flex-col ${
          isLanding ? "ambient-rose-glow" : ""
        }`}
      >
        {/* Top Utility Bar */}
        <header className="flex items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                aria-label="Buka sidebar"
                onClick={() => setSidebarOpen(true)}
                className="hidden rounded-lg p-1.5 text-[#A1A1AA] transition-colors hover:bg-[#1E1F23] hover:text-white md:inline-flex"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setActiveTab("search");
                setSearchResult(null);
                setQuery("");
              }}
              className="flex items-center gap-2 md:hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-mark.png"
                alt="SmartSari"
                className="h-6 w-6 object-contain drop-shadow-[0_0_8px_rgba(244,114,182,0.35)]"
              />
              <span className="text-sm font-semibold text-white">
                Smart<span className="text-[#F472B6]">Sari</span>
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <PwaRegistrar />
          </div>
        </header>

        {/* Sticky Search Header When Showing Results */}
        {activeTab === "search" && !isLanding && (
          <div className="sticky top-0 z-20 border-b border-[#232429] bg-[#0E0F12]/90 px-4 py-3 backdrop-blur-md sm:px-6">
            {renderPillSearchBar(true)}
          </div>
        )}

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 sm:px-8">
          {notice && (
            <div
              role="status"
              className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                notice.type === "error"
                  ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#FCA5A5]"
                  : notice.type === "success"
                    ? "border-[#DB2777]/30 bg-[#DB2777]/12 text-[#F9A8D4]"
                    : "border-[#2C2E35] bg-[#151619] text-[#E4E4E7]"
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
                  className="rounded p-1 hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {activeTab === "search" && isLanding && (
            <div className="animate-fade-up flex min-h-[74vh] flex-col items-center justify-center">
              <div className="mb-5 flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-mark.png"
                  alt="SmartSari"
                  className="h-14 w-14 object-contain drop-shadow-[0_0_22px_rgba(244,114,182,0.32)] sm:h-16 sm:w-16"
                />
                <div className="flex flex-col items-center">
                  <span className="text-lg font-semibold tracking-[-0.02em] text-[#F4F4F5]">
                    Smart
                    <span className="bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#DB2777] bg-clip-text text-transparent">
                      Sari
                    </span>
                  </span>
                </div>
              </div>

              <h1 className="mb-6 text-center text-[26px] font-medium tracking-[-0.02em] text-[#F4F4F5] sm:text-[34px]">
                Mau cari jurnal apa hari ini?
              </h1>

              {renderPillSearchBar(false)}

              {/* 2-Pill Mode Toggle (like Chat | Task in reference) */}
              <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-[#151619] p-1 border border-[#232429]">
                <button
                  type="button"
                  onClick={() => setPdfOnly(false)}
                  className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                    !pdfOnly
                      ? "bg-[#2C2E35] text-white"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  Semua Rank
                </button>
                <button
                  type="button"
                  onClick={() => setPdfOnly(true)}
                  className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                    pdfOnly
                      ? "bg-[#DB2777] text-white"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  Khusus PDF
                </button>
              </div>

              {/* Minimal Vertical Starter List (Reference-Faithful) */}
              <div className="mt-7 w-full max-w-md space-y-1">
                {STARTER_SUGGESTIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.query}
                      type="button"
                      onClick={() => void runSearch(item.query)}
                      className="btn-tactile flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs text-[#A1A1AA] transition-colors hover:bg-[#1E1F23] hover:text-white"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#F472B6]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "search" && !isLanding && (
            <div>
              {searchError && (
                <div className="mb-4 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-3.5 text-sm text-[#FCA5A5]">
                  {searchError}
                </div>
              )}

              {searching && (
                <div className="divide-y divide-[#232429]">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="animate-pulse py-5">
                      <div className="h-4 w-16 rounded bg-[#1E1F23]" />
                      <div className="mt-2.5 h-5 w-3/4 rounded bg-[#1E1F23]" />
                      <div className="mt-2 h-3.5 w-1/2 rounded bg-[#1E1F23]" />
                      <div className="mt-3 h-12 w-full rounded bg-[#1E1F23]" />
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchResult && (
                <div>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#A1A1AA]">
                    <span>
                      Menampilkan{" "}
                      <strong className="font-mono tabular-nums text-white">
                        {searchResult.total}
                      </strong>{" "}
                      artikel untuk &ldquo;{searchResult.query}&rdquo;
                    </span>
                    <span className="font-mono text-[11px] text-[#71717A]">
                      {searchResult.sourceStats
                        .map((st) => `${st.source}: ${st.ok ? st.count : "err"}`)
                        .join(" · ")}
                    </span>
                  </div>

                  {searchResult.papers.length === 0 ? (
                    <div className="rounded-xl border border-[#232429] bg-[#151619] p-8 text-center">
                      <p className="text-base font-semibold text-white">
                        Tidak ada artikel yang cocok
                      </p>
                      <p className="mt-1 text-sm text-[#A1A1AA]">
                        Coba kata kunci lebih umum atau matikan mode Khusus PDF.
                      </p>
                    </div>
                  ) : (
                    <>
                      {groupedResults.length > 1 && (
                        <nav
                          aria-label="Lompat ke peringkat"
                          className="sticky top-[71px] z-10 -mx-1 mb-5 flex items-center gap-1.5 overflow-x-auto border-b border-[#232429] bg-[#0E0F12]/95 px-1 py-2 backdrop-blur-sm"
                        >
                          <span className="shrink-0 text-[11px] font-medium text-[#71717A]">
                            Lompat:
                          </span>
                          {groupedResults.map((group) => (
                            <a
                              key={group.tier}
                              href={`#rank-${group.tier}`}
                              className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                                group.meta.priority
                                  ? "bg-[#DB2777] text-white hover:bg-[#BE185D]"
                                  : "border border-[#2C2E35] bg-[#151619] text-[#A1A1AA] hover:border-[#DB2777] hover:text-white"
                              }`}
                            >
                              {group.meta.badge} ({group.papers.length})
                            </a>
                          ))}
                        </nav>
                      )}

                      <div className="space-y-8">
                        {groupedResults.map((group, idx) => (
                          <section
                            key={group.tier}
                            id={`rank-${group.tier}`}
                            aria-label={group.meta.title}
                            style={{
                              animationDelay: `${Math.min(idx * 55, 220)}ms`,
                            }}
                            className="animate-fade-up scroll-mt-32"
                          >
                            <div
                              className={`flex items-baseline justify-between gap-3 pb-2 ${
                                group.meta.priority
                                  ? "border-b-2 border-[#DB2777]"
                                  : "border-b border-[#2C2E35]"
                              }`}
                            >
                              <div className="flex items-baseline gap-2.5">
                                <span
                                  className={`font-mono text-xs font-bold ${
                                    group.meta.priority
                                      ? "text-[#F472B6]"
                                      : "text-[#F4F4F5]"
                                  }`}
                                >
                                  {group.meta.badge}
                                </span>
                                <h2 className="text-sm font-semibold text-[#F4F4F5]">
                                  {group.meta.title}
                                </h2>
                              </div>
                              <span className="font-mono text-xs tabular-nums text-[#71717A]">
                                {group.papers.length} artikel
                              </span>
                            </div>

                            <div className="divide-y divide-[#232429]">
                              {group.papers.map((paper) => (
                                <PaperCard
                                  key={paper.paperKey}
                                  paper={paper}
                                  isBookmarked={bookmarkedMap.has(
                                    paper.paperKey
                                  )}
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
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "bookmarks" && (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#232429] pb-3">
                <h2 className="text-lg font-semibold text-white">
                  Jurnal Tersimpan ({bookmarks.length})
                </h2>
                {bookmarks.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                    <input
                      type="search"
                      value={bookmarksFilter}
                      onChange={(e) => setBookmarksFilter(e.target.value)}
                      placeholder="Cari di jurnal tersimpan..."
                      className="min-h-[38px] w-full rounded-full border border-[#2C2E35] bg-[#151619] py-1.5 pl-8 pr-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:border-[#DB2777] focus:outline-none sm:text-xs"
                    />
                  </div>
                )}
              </div>

              {bookmarks.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-8 text-center">
                  <p className="text-base font-semibold text-white">
                    Belum ada jurnal tersimpan
                  </p>
                  <p className="mt-1 text-sm text-[#A1A1AA]">
                    Klik &ldquo;Simpan&rdquo; pada artikel hasil pencarian untuk
                    menyimpannya ke koleksi Anda.
                  </p>
                </div>
              ) : filteredBookmarks.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-6 text-center text-sm text-[#A1A1AA]">
                  Tidak ada jurnal tersimpan yang cocok dengan &ldquo;
                  {bookmarksFilter}&rdquo;.
                </div>
              ) : (
                <div className="divide-y divide-[#232429]">
                  {filteredBookmarks.map((b) => (
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#232429] pb-3">
                <h2 className="text-lg font-semibold text-white">
                  Arsip Konversi Word ({conversions.length})
                </h2>
                {conversions.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                    <input
                      type="search"
                      value={conversionsFilter}
                      onChange={(e) => setConversionsFilter(e.target.value)}
                      placeholder="Cari di arsip Word..."
                      className="min-h-[38px] w-full rounded-full border border-[#2C2E35] bg-[#151619] py-1.5 pl-8 pr-3 text-sm text-[#F4F4F5] placeholder:text-[#71717A] focus:border-[#DB2777] focus:outline-none sm:text-xs"
                    />
                  </div>
                )}
              </div>

              {conversions.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-8 text-center">
                  <p className="text-base font-semibold text-white">
                    Belum ada arsip konversi Word
                  </p>
                  <p className="mt-1 text-sm text-[#A1A1AA]">
                    Pilih salah satu artikel lalu klik &ldquo;Ekspor Word&rdquo;
                    atau &ldquo;Terjemahkan ID&rdquo;.
                  </p>
                </div>
              ) : filteredConversions.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-6 text-center text-sm text-[#A1A1AA]">
                  Tidak ada arsip Word yang cocok dengan &ldquo;
                  {conversionsFilter}&rdquo;.
                </div>
              ) : (
                <div className="divide-y divide-[#232429]">
                  {filteredConversions.map((conv) => (
                    <div
                      key={conv.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#A1A1AA]">
                          <span className="rounded-md bg-[#DB2777]/15 px-2 py-0.5 font-medium text-[#F472B6]">
                            {MODE_BADGE[conv.mode] || conv.mode}
                          </span>
                          <span className="font-mono text-[11px]">
                            {conv.model}
                          </span>
                          {conv.year && (
                            <span className="font-mono tabular-nums">
                              {conv.year}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-[#F4F4F5] sm:text-base">
                          {conv.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/conversions/${conv.id}/download`}
                          className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#DB2777] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D]"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          Unduh .docx
                        </a>
                        <button
                          type="button"
                          aria-label="Hapus arsip konversi"
                          onClick={() => void handleDeleteConversion(conv.id)}
                          className="min-h-[38px] rounded-full border border-[#2C2E35] p-2 text-[#71717A] hover:border-[#EF4444]/40 hover:text-[#F87171]"
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
              <div className="mb-4 flex items-center justify-between border-b border-[#232429] pb-3">
                <h2 className="text-lg font-semibold text-white">
                  Riwayat Pencarian ({history.length})
                </h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleClearHistory()}
                    className="text-xs font-medium text-[#F87171] hover:underline"
                  >
                    Hapus Semua
                  </button>
                )}
              </div>
              {history.length > 0 && (
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="search"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder="Cari riwayat pencarian..."
                    className="min-h-[42px] w-full rounded-full border border-[#2C2E35] bg-[#151619] py-2 pl-10 pr-3 text-base text-[#F4F4F5] placeholder:text-[#71717A] focus:border-[#DB2777] focus:outline-none sm:text-sm"
                  />
                </div>
              )}
              {history.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-8 text-center">
                  <p className="text-sm text-[#A1A1AA]">
                    Belum ada riwayat pencarian.
                  </p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#151619] p-6 text-center text-sm text-[#A1A1AA]">
                  Tidak ada riwayat yang cocok dengan &ldquo;{historyFilter}
                  &rdquo;.
                </div>
              ) : (
                <ul className="divide-y divide-[#232429]">
                  {filteredHistory.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => void runSearch(item.query)}
                        className="flex min-h-[40px] min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm"
                      >
                        <span className="truncate font-medium text-[#F4F4F5]">
                          {item.query}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-[#71717A]">
                          {formatRelativeTimeId(item.createdAt)} ·{" "}
                          {item.resultCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus riwayat ${item.query}`}
                        onClick={() => void handleDeleteHistoryItem(item.id)}
                        className="min-h-[38px] min-w-[38px] rounded-full p-2 text-[#71717A] hover:text-[#F87171]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Floating Scroll-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          aria-label="Kembali ke atas"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="btn-tactile fixed bottom-20 right-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#2C2E35] bg-[#1E1F23] text-[#F472B6] shadow-lg hover:border-[#DB2777] md:bottom-6 md:right-6"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}

      {/* Mobile Sticky Bottom Navigation */}
      <nav
        aria-label="Navigasi seluler"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#232429] bg-[#151619] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-semibold ${
            activeTab === "search"
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
          }`}
        >
          <Search className="h-4 w-4" />
          Cari
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bookmarks")}
          className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 border-t-2 text-[11px] font-semibold ${
            activeTab === "bookmarks"
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
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
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
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
              ? "border-[#DB2777] text-[#F472B6]"
              : "border-transparent text-[#A1A1AA]"
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
