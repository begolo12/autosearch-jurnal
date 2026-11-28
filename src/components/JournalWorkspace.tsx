"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Bookmark,
  Check,
  Cloud,
  Copy,
  FileDown,
  FileText,
  FolderOpen,
  HelpCircle,
  History,
  Loader2,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  SlidersHorizontal,
  SquarePen,
  Table2,
  Trash2,
  Upload,
  User,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { AuthModal } from "@/components/AuthModal";
import { CitationNetworkModal } from "@/components/CitationNetworkModal";
import { LiteratureMatrixModal } from "@/components/LiteratureMatrixModal";
import { PaperCard } from "@/components/PaperCard";
import { PdfReaderModal } from "@/components/PdfReaderModal";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { SettingsModal, type SettingsTabId } from "@/components/SettingsModal";
import { FootnoteLinkedText } from "@/lib/footnote-links";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import {
  DEFAULT_SEARCH_PREFS,
  getStoredSearchPrefs,
  type SearchDefaultPrefs,
} from "@/lib/appearance";
import {
  exportCitationsBib,
  exportCitationsRis,
  formatCitation,
  formatRelativeTimeId,
} from "@/lib/citation";
import {
  clearAllLocalCache,
  getCachedBrief,
  getCachedMatrix,
  getCachedSearch,
  getUiSession,
  getWorkspaceSnapshot,
  notifyQuotaUpdated,
  patchUiSessionScroll,
  setCachedBrief,
  setCachedMatrix,
  setCachedSearch,
  setUiSession,
  setWorkspaceSnapshot,
  type UiNetworkSession,
  type UiReaderSession,
} from "@/lib/local-cache";
import {
  TIER_PRIORITY_ORDER,
  type AuthUser,
  type BookmarkRecord,
  type ConversionMode,
  type ConversionRecord,
  type DailyQuotaStatus,
  type JournalPaper,
  type JournalTier,
  type LiteratureMatrixResult,
  type ResearchProjectRecord,
  type SearchHistoryRecord,
  type SearchResearchBrief,
  type SearchResponse,
  type SearchSource,
  type SortOption,
} from "@/lib/types";
import { getSafeHttpUrl } from "@/lib/url";

type ActiveTab = "search" | "bookmarks" | "conversions" | "history";
type TierPresetId = "all" | "q1" | "q1_q2" | "q1_q4" | "sinta";

const TIER_PRESETS: Array<{
  id: TierPresetId;
  label: string;
  tiers: JournalTier[];
}> = [
  { id: "all", label: "Semua Tier", tiers: [...TIER_PRIORITY_ORDER] },
  { id: "q1", label: "Khusus Q1", tiers: ["Q1"] },
  { id: "q1_q2", label: "Q1–Q2", tiers: ["Q1", "Q2"] },
  { id: "q1_q4", label: "Q1–Q4", tiers: ["Q1", "Q2", "Q3", "Q4"] },
  {
    id: "sinta",
    label: "SINTA 1–6",
    tiers: ["SINTA1", "SINTA2", "SINTA3", "SINTA4", "SINTA5", "SINTA6"],
  },
];

const ALL_SOURCES: Array<{ id: SearchSource; label: string }> = [
  { id: "openalex", label: "OpenAlex" },
  { id: "europepmc", label: "Europe PMC" },
  { id: "crossref", label: "Crossref" },
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
    "crossref",
  ]);
  const [tierPreset, setTierPreset] = useState<TierPresetId>("all");
  const [pdfOnly, setPdfOnly] = useState(false);
  const [yearFrom, setYearFrom] = useState<string>("");
  const [sort, setSort] = useState<SortOption>("relevance");
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchSyncBadge, setSearchSyncBadge] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeSearchCacheKey, setActiveSearchCacheKey] = useState<
    string | null
  >(null);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId | null>(null);
  const [searchPrefs, setSearchPrefs] =
    useState<SearchDefaultPrefs>(DEFAULT_SEARCH_PREFS);
  const [quotaStatus, setQuotaStatus] = useState<DailyQuotaStatus | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfUploadInputRef = useRef<HTMLInputElement>(null);
  const uploadedBlobUrlRef = useRef<string | null>(null);
  const [projects, setProjects] = useState<ResearchProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const [selectedPapersMap, setSelectedPapersMap] = useState<
    Record<string, JournalPaper>
  >({});
  const [buildingMatrix, setBuildingMatrix] = useState(false);
  const [matrixResult, setMatrixResult] =
    useState<LiteratureMatrixResult | null>(null);
  const [activeMatrixKey, setActiveMatrixKey] = useState<string | null>(null);
  const [searchBrief, setSearchBrief] = useState<SearchResearchBrief | null>(
    null
  );
  const [activeBriefCacheKey, setActiveBriefCacheKey] = useState<string | null>(
    null
  );
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [networkState, setNetworkState] = useState<UiNetworkSession | null>(
    null
  );
  const [exportingBibDocx, setExportingBibDocx] = useState(false);

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
  const sessionHydratedRef = useRef(false);
  const pendingRestoreSearchRef = useRef<{
    query: string;
    pdfOnly: boolean;
    tierPreset: TierPresetId;
  } | null>(null);

  const [readerState, setReaderState] = useState<UiReaderSession | null>(null);

  const [downloadingPdfKey, setDownloadingPdfKey] = useState<string | null>(
    null
  );
  const [convertingKey, setConvertingKey] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [resultFilter, setResultFilter] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  useBodyScrollLock(showShortcutsModal);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedAllApa, setCopiedAllApa] = useState(false);
  const [notice, setNotice] = useState<{
    type: "info" | "error" | "success";
    message: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    queueMicrotask(() => setIsOffline(!window.navigator.onLine));
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (activeTab === "search" && searchResult?.query) {
      document.title = `"${searchResult.query}" — SmartSari`;
    } else if (activeTab === "bookmarks") {
      document.title = `Tersimpan (${bookmarks.length}) — SmartSari`;
    } else if (activeTab === "conversions") {
      document.title = `Arsip Word (${conversions.length}) — SmartSari`;
    } else if (activeTab === "history") {
      document.title = "Riwayat — SmartSari";
    } else {
      document.title = "SmartSari by AirEvo — Pencarian Jurnal Terfilter & Akurat";
    }
  }, [activeTab, searchResult?.query, bookmarks.length, conversions.length]);

  useEffect(() => {
    if (!notice || notice.type === "error" || notice.actionUrl) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!confirmClearHistory) return;
    const timer = setTimeout(() => setConfirmClearHistory(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClearHistory]);

  const resetToHome = useCallback(() => {
    setActiveTab("search");
    setSearchResult(null);
    setSearchBrief(null);
    setActiveSearchCacheKey(null);
    setActiveBriefCacheKey(null);
    setActiveMatrixKey(null);
    setMatrixResult(null);
    setReaderState(null);
    setNetworkState(null);
    setSearchSyncBadge(null);
    setSearchError(null);
    setQuery("");
    setSort(searchPrefs.defaultSort);
    setPdfOnly(searchPrefs.defaultPdfOnly);
    setTierPreset(searchPrefs.defaultTierPreset);
  }, [searchPrefs]);

  const handleSearchPrefsChange = useCallback((next: SearchDefaultPrefs) => {
    setSearchPrefs(next);
    setSort(next.defaultSort);
    setPdfOnly(next.defaultPdfOnly);
    setTierPreset(next.defaultTierPreset);
  }, []);

  const handleReaderViewChange = useCallback(
    (view: {
      desktopView: "split" | "pdf" | "translate" | "chat";
      mobileTab: "pdf" | "translate" | "chat";
    }) => {
      setReaderState((prev) =>
        !prev ||
        (prev.desktopView === view.desktopView &&
          prev.mobileTab === view.mobileTab)
          ? prev
          : { ...prev, ...view }
      );
    },
    []
  );

  const handleNetworkStateChange = useCallback(
    (st: {
      trail: JournalPaper[];
      activeTab: "citing" | "references" | "related";
    }) => {
      setNetworkState((prev) =>
        !prev ||
        (prev.activeTab === st.activeTab &&
          prev.trail.length === st.trail.length &&
          prev.trail[prev.trail.length - 1]?.paperKey ===
            st.trail[st.trail.length - 1]?.paperKey)
          ? prev
          : { ...prev, trail: st.trail, activeTab: st.activeTab }
      );
    },
    []
  );

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota", { cache: "no-store" });
      if (res.ok) {
        const qJson = (await res.json()) as DailyQuotaStatus;
        setQuotaStatus(qJson);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  const reloadWorkspaceData = useCallback(async () => {
    try {
      const [meRes, pRes, bRes, hRes, cRes, qRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/projects"),
        fetch("/api/bookmarks"),
        fetch("/api/history"),
        fetch("/api/conversions"),
        fetch("/api/quota", { cache: "no-store" }),
      ]);

      let nextUser: AuthUser | null = null;
      let nextProjects: ResearchProjectRecord[] = [];
      let nextBookmarks: BookmarkRecord[] = [];
      let nextHistory: SearchHistoryRecord[] = [];
      let nextConversions: ConversionRecord[] = [];

      if (meRes.ok) {
        const meJson = (await meRes.json()) as { user?: AuthUser | null };
        nextUser = meJson.user ?? null;
        setAuthUser(nextUser);
      }
      if (pRes.ok) {
        const pJson = (await pRes.json()) as {
          projects?: ResearchProjectRecord[];
        };
        nextProjects = pJson.projects ?? [];
        setProjects(nextProjects);
      }
      if (bRes.ok) {
        const bJson = (await bRes.json()) as { bookmarks?: BookmarkRecord[] };
        nextBookmarks = bJson.bookmarks ?? [];
        setBookmarks(nextBookmarks);
      }
      if (hRes.ok) {
        const hJson = (await hRes.json()) as {
          history?: SearchHistoryRecord[];
        };
        nextHistory = hJson.history ?? [];
        setHistory(nextHistory);
      }
      if (cRes.ok) {
        const cJson = (await cRes.json()) as {
          conversions?: ConversionRecord[];
        };
        nextConversions = cJson.conversions ?? [];
        setConversions(nextConversions);
      }
      if (qRes.ok) {
        const qJson = (await qRes.json()) as DailyQuotaStatus;
        setQuotaStatus(qJson);
      }

      if (meRes.ok && bRes.ok && hRes.ok && cRes.ok) {
        setWorkspaceSnapshot({
          authUser: nextUser,
          projects: nextProjects,
          bookmarks: nextBookmarks,
          history: nextHistory,
          conversions: nextConversions,
        });
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingSidebar(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const storedPrefs = getStoredSearchPrefs();
      setSearchPrefs(storedPrefs);

      const snap = getWorkspaceSnapshot();
      if (snap) {
        setAuthUser(snap.authUser);
        setProjects(snap.projects);
        setBookmarks(snap.bookmarks);
        setHistory(snap.history);
        setConversions(snap.conversions);
        setLoadingSidebar(false);
      }

      const urlParams = new URLSearchParams(window.location.search);
      const saved = getUiSession();

      const urlTab = urlParams.get("tab") as ActiveTab | null;
      const urlProject = urlParams.get("project");
      const urlQuery = urlParams.get("q");
      const urlTier = urlParams.get("tier") as TierPresetId | null;
      const urlPdf = urlParams.get("pdf");
      const urlYear = urlParams.get("year");
      const urlSort = urlParams.get("sort") as SortOption | null;

      if (saved) {
        setActiveTab(
          urlTab &&
            ["search", "bookmarks", "conversions", "history"].includes(urlTab)
            ? urlTab
            : saved.activeTab
        );
        setSidebarOpen(saved.sidebarOpen);
        setSelectedProjectId(urlProject ?? saved.selectedProjectId);
        setQuery(urlQuery ?? saved.query);
        if (saved.selectedSources?.length) {
          setSelectedSources(saved.selectedSources);
        }
        setTierPreset(urlTier ?? saved.tierPreset);
        setPdfOnly(urlPdf === "1" ? true : saved.pdfOnly);
        setYearFrom(urlYear ?? saved.yearFrom);
        setSort(urlSort ?? saved.sort);
        setSelectedPapersMap(saved.selectedPapersMap ?? {});
        if (saved.readerState) setReaderState(saved.readerState);
        if (saved.networkState) setNetworkState(saved.networkState);

        let restoredSearch = false;
        if (saved.activeSearchCacheKey) {
          const cached = getCachedSearch(saved.activeSearchCacheKey);
          if (cached) {
            setSearchResult(cached.data);
            setActiveSearchCacheKey(saved.activeSearchCacheKey);
            setSearchSyncBadge("Cache Lokal · Dipulihkan");
            restoredSearch = true;
          }
        }

        if (saved.activeBriefCacheKey) {
          const cachedBrief = getCachedBrief(saved.activeBriefCacheKey);
          if (cachedBrief) {
            setSearchBrief(cachedBrief);
            setActiveBriefCacheKey(saved.activeBriefCacheKey);
          }
        }

        if (saved.activeMatrixKey) {
          const cachedMatrix = getCachedMatrix(saved.activeMatrixKey);
          if (cachedMatrix) {
            setMatrixResult(cachedMatrix);
            setActiveMatrixKey(saved.activeMatrixKey);
          }
        }

        const effectiveQuery = (urlQuery ?? saved.query).trim();
        const effectiveTab =
          urlTab &&
          ["search", "bookmarks", "conversions", "history"].includes(urlTab)
            ? urlTab
            : saved.activeTab;

        if (
          !restoredSearch &&
          effectiveTab === "search" &&
          effectiveQuery.length >= 2 &&
          (urlQuery || saved.activeSearchCacheKey)
        ) {
          pendingRestoreSearchRef.current = {
            query: effectiveQuery,
            pdfOnly: urlPdf === "1" ? true : saved.pdfOnly,
            tierPreset: urlTier ?? saved.tierPreset,
          };
        }

        if (
          saved.scrollY &&
          saved.scrollY > 0 &&
          !saved.readerState &&
          !saved.networkState &&
          !saved.activeMatrixKey
        ) {
          const targetY = saved.scrollY;
          requestAnimationFrame(() => window.scrollTo(0, targetY));
        }
      } else {
        setTierPreset(urlTier ?? storedPrefs.defaultTierPreset);
        setPdfOnly(urlPdf === "1" ? true : storedPrefs.defaultPdfOnly);
        setSort(urlSort ?? storedPrefs.defaultSort);

        if (urlTab || urlQuery || urlProject) {
          if (
            urlTab &&
            ["search", "bookmarks", "conversions", "history"].includes(urlTab)
          ) {
            setActiveTab(urlTab);
          }
          if (urlProject) setSelectedProjectId(urlProject);
          if (urlYear) setYearFrom(urlYear);
          if (urlQuery && urlQuery.trim().length >= 2) {
            setQuery(urlQuery);
            pendingRestoreSearchRef.current = {
              query: urlQuery.trim(),
              pdfOnly: urlPdf === "1" ? true : storedPrefs.defaultPdfOnly,
              tierPreset: urlTier ?? storedPrefs.defaultTierPreset,
            };
          }
        }
      }

      sessionHydratedRef.current = true;
      void reloadWorkspaceData();
    });
  }, [reloadWorkspaceData]);

  useEffect(() => {
    const onQuotaUpdated = () => {
      void refreshQuota();
    };
    window.addEventListener("smartsari:quota-updated", onQuotaUpdated);
    return () => {
      window.removeEventListener("smartsari:quota-updated", onQuotaUpdated);
      if (uploadedBlobUrlRef.current) {
        URL.revokeObjectURL(uploadedBlobUrlRef.current);
      }
    };
  }, [refreshQuota]);

  useEffect(() => {
    if (!sessionHydratedRef.current) return;

    const persistableReaderState = readerState?.paper.paperKey.startsWith(
      "upload:"
    )
      ? null
      : readerState;

    setUiSession({
      activeTab,
      sidebarOpen,
      selectedProjectId,
      query,
      selectedSources,
      tierPreset,
      pdfOnly,
      yearFrom,
      sort,
      activeSearchCacheKey,
      activeBriefCacheKey,
      activeMatrixKey,
      selectedPapersMap,
      readerState: persistableReaderState,
      networkState,
    });

    const isHomeLanding =
      activeTab === "search" &&
      !searchResult &&
      !readerState &&
      !networkState &&
      !matrixResult;

    if (isHomeLanding) {
      if (window.location.search) {
        window.history.replaceState(null, "", "/");
      }
      return;
    }

    const params = new URLSearchParams();
    if (activeTab !== "search") params.set("tab", activeTab);
    if (activeTab === "bookmarks" && selectedProjectId) {
      params.set("project", selectedProjectId);
    }
    if (activeTab === "search" && (searchResult?.query || query.trim())) {
      params.set("q", (searchResult?.query || query).trim());
    }
    if (tierPreset !== "all") params.set("tier", tierPreset);
    if (pdfOnly) params.set("pdf", "1");
    if (yearFrom) params.set("year", yearFrom);
    if (sort !== "relevance") params.set("sort", sort);
    if (readerState) params.set("view", "pdf");
    else if (networkState) params.set("view", "network");
    else if (matrixResult) params.set("view", "matrix");

    const qs = params.toString();
    const nextUrl = qs ? `/?${qs}` : "/";
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    activeTab,
    sidebarOpen,
    selectedProjectId,
    query,
    selectedSources,
    tierPreset,
    pdfOnly,
    yearFrom,
    sort,
    activeSearchCacheKey,
    activeBriefCacheKey,
    activeMatrixKey,
    selectedPapersMap,
    readerState,
    networkState,
    searchResult,
    matrixResult,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        setShowFilterMenu(false);
        setShowAuthModal(false);
        setShowShortcutsModal(false);
        setMatrixResult(null);
        setActiveMatrixKey(null);
        setNetworkState(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
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
      } else if (e.key === "?" && !inEditable && !readerState) {
        e.preventDefault();
        setShowShortcutsModal((v) => !v);
      }
    };

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 450);
      if (!readerState && !networkState && !matrixResult) {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          patchUiSessionScroll(window.scrollY);
        }, 250);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [readerState, networkState, matrixResult]);

  const filteredHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return history;
    return history.filter((item) => item.query.toLowerCase().includes(q));
  }, [history, historyFilter]);

  const filteredBookmarks = useMemo(() => {
    const q = bookmarksFilter.trim().toLowerCase();
    return bookmarks.filter((b) => {
      if (selectedProjectId && b.projectId !== selectedProjectId) {
        return false;
      }
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        (b.venue || "").toLowerCase().includes(q) ||
        (b.note || "").toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [bookmarks, bookmarksFilter, selectedProjectId]);

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
    async (
      overrideQuery?: string,
      overridePdfOnly?: boolean,
      overrideTierPreset?: TierPresetId,
      pageNum = 1,
      append = false,
      forceOnline = false,
      overrideSort?: SortOption,
      overrideYearFrom?: string,
      overrideSources?: SearchSource[]
    ) => {
      const q = (overrideQuery ?? query).trim();
      if (q.length < 2) {
        setSearchError("Masukkan kata kunci minimal 2 karakter.");
        return;
      }
      if (overrideQuery !== undefined) {
        setQuery(overrideQuery);
      }

      const effectivePdfOnly = overridePdfOnly ?? pdfOnly;
      const effectivePresetId = overrideTierPreset ?? tierPreset;
      const effectiveSort = overrideSort ?? sort;
      const effectiveYearFrom = overrideYearFrom ?? yearFrom;
      const effectiveSources = overrideSources ?? selectedSources;
      const preset =
        TIER_PRESETS.find((p) => p.id === effectivePresetId) ?? TIER_PRESETS[0];

      const searchCacheKey = JSON.stringify({
        q: q.toLowerCase().replace(/\s+/g, " "),
        sources: [...effectiveSources].sort(),
        preset: effectivePresetId,
        pdfOnly: effectivePdfOnly,
        yearFrom: effectiveYearFrom,
        sort: effectiveSort,
      });
      const briefCacheKey = `${q.toLowerCase().replace(/\s+/g, " ")}::${effectivePresetId}`;

      setActiveTab("search");
      setShowFilterMenu(false);
      setSearchError(null);
      setNotice(null);
      setActiveSearchCacheKey(searchCacheKey);
      setActiveBriefCacheKey(briefCacheKey);

      let servedFromCache = false;
      let cachedEntry: { data: SearchResponse; savedAt: number } | null = null;

      if (pageNum === 1 && !append) {
        cachedEntry = getCachedSearch(searchCacheKey);
        if (cachedEntry) {
          servedFromCache = true;
          setSearchResult(cachedEntry.data);
          setSearchBrief(getCachedBrief(briefCacheKey));
          const ageMinutes = (Date.now() - cachedEntry.savedAt) / 60000;
          if (!forceOnline && ageMinutes < 10) {
            setSearchSyncBadge("Cache Lokal · Instan");
            return;
          }
          setSearchSyncBadge("Cache Lokal · Memeriksa jurnal baru...");
        } else {
          setSearching(true);
          setSearchSyncBadge(null);
        }
      } else if (append) {
        setLoadingMore(true);
      } else {
        setSearching(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("q", q);
        if (
          effectiveSources.length > 0 &&
          effectiveSources.length < ALL_SOURCES.length
        ) {
          params.set("sources", effectiveSources.join(","));
        }
        if (effectivePresetId !== "all") {
          params.set("tiers", preset.tiers.join(","));
        }
        if (effectivePdfOnly) params.set("pdfOnly", "true");
        if (effectiveYearFrom) params.set("yearFrom", effectiveYearFrom);
        params.set("sort", effectiveSort);
        params.set("page", String(pageNum));

        const res = await fetch(`/api/search?${params.toString()}`);
        const data = (await res.json()) as SearchResponse & { error?: string };

        if (!res.ok) {
          if (!servedFromCache) {
            setSearchError(data.error || "Pencarian gagal dijalankan.");
          } else {
            setSearchSyncBadge("Cache Lokal · Offline");
          }
          return;
        }

        if (append) {
          setSearchResult((prev) => {
            if (!prev) return data;
            const seen = new Set(prev.papers.map((p) => p.paperKey));
            const extra = data.papers.filter((p) => !seen.has(p.paperKey));
            const merged = [...prev.papers, ...extra];
            const updated: SearchResponse = {
              ...data,
              total: merged.length,
              papers: merged,
            };
            setCachedSearch(searchCacheKey, updated);
            return updated;
          });
        } else if (servedFromCache && cachedEntry) {
          // Incremental delta merge: keep cached papers intact and prepend/append only new ones
          const existingKeys = new Set(
            cachedEntry.data.papers.map((p) => p.paperKey)
          );
          const newPapers = data.papers.filter(
            (p) => !existingKeys.has(p.paperKey)
          );
          if (newPapers.length > 0) {
            const merged = [...newPapers, ...cachedEntry.data.papers];
            const updated: SearchResponse = {
              ...data,
              total: merged.length,
              papers: merged,
            };
            setSearchResult(updated);
            setCachedSearch(searchCacheKey, updated);
            setSearchSyncBadge(`Cache Lokal · +${newPapers.length} jurnal baru`);
          } else {
            setCachedSearch(searchCacheKey, cachedEntry.data);
            setSearchSyncBadge("Cache Lokal · Data mutakhir");
          }
        } else {
          setSearchResult(data);
          setSearchBrief(getCachedBrief(briefCacheKey));
          setCachedSearch(searchCacheKey, data);
          setSearchSyncBadge(null);
          const hRes = await fetch("/api/history");
          if (hRes.ok) {
            const hJson = (await hRes.json()) as {
              history?: SearchHistoryRecord[];
            };
            setHistory(hJson.history ?? []);
          }
        }
      } catch {
        if (!servedFromCache) {
          setSearchError("Tidak dapat terhubung ke server pencarian.");
        } else {
          setSearchSyncBadge("Cache Lokal · Offline");
        }
      } finally {
        setSearching(false);
        setLoadingMore(false);
      }
    },
    [query, selectedSources, pdfOnly, tierPreset, yearFrom, sort]
  );

  useEffect(() => {
    const pending = pendingRestoreSearchRef.current;
    if (!pending) return;
    pendingRestoreSearchRef.current = null;
    void runSearch(pending.query, pending.pdfOnly, pending.tierPreset);
  }, [runSearch]);

  const handleGenerateBrief = async () => {
    if (!searchResult || searchResult.papers.length === 0 || loadingBrief) {
      return;
    }
    const briefCacheKey = `${searchResult.query.toLowerCase().replace(/\s+/g, " ")}::${tierPreset}`;
    setActiveBriefCacheKey(briefCacheKey);
    const cached = getCachedBrief(briefCacheKey);
    if (cached) {
      setSearchBrief(cached);
      return;
    }

    setLoadingBrief(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchResult.query,
          papers: searchResult.papers.slice(0, 8).map((p) => ({
            title: p.title,
            authors: p.authors,
            year: p.year,
            venue: p.venue,
            tierLabel: p.journalMetrics?.tierLabel ?? null,
            abstract: p.abstract,
            citations: p.citations,
          })),
        }),
      });
      const data = (await res.json()) as {
        brief?: SearchResearchBrief;
        error?: string;
        requireLogin?: boolean;
      };
      if (!res.ok || !data.brief) {
        setNotice({
          type: "error",
          message: data.error || "Gagal menyusun ringkasan AI.",
        });
        if (data.requireLogin) setShowAuthModal(true);
        return;
      }
      setSearchBrief(data.brief);
      setCachedBrief(briefCacheKey, data.brief);
    } catch {
      setNotice({
        type: "error",
        message: "Gangguan koneksi saat memanggil asisten AI.",
      });
    } finally {
      setLoadingBrief(false);
      notifyQuotaUpdated();
    }
  };

  const selectedMatrixList = useMemo(
    () => Object.values(selectedPapersMap),
    [selectedPapersMap]
  );

  const handleToggleSelectMatrix = (paper: JournalPaper) => {
    setSelectedPapersMap((prev) => {
      if (prev[paper.paperKey]) {
        const next = { ...prev };
        delete next[paper.paperKey];
        return next;
      }
      if (Object.keys(prev).length >= 5) {
        setNotice({
          type: "info",
          message: "Maksimal 5 jurnal yang dapat dibandingkan sekaligus.",
        });
        return prev;
      }
      return { ...prev, [paper.paperKey]: paper };
    });
  };

  const handleBuildMatrix = async (papersToAnalyze?: JournalPaper[]) => {
    const list = papersToAnalyze ?? selectedMatrixList;
    if (list.length < 2) {
      setNotice({
        type: "info",
        message: "Pilih minimal 2 jurnal untuk membuat Matriks Literatur.",
      });
      return;
    }

    const matrixKey = list
      .slice(0, 5)
      .map((p) => p.paperKey)
      .sort()
      .join("|");
    setActiveMatrixKey(matrixKey);
    const cached = getCachedMatrix(matrixKey);
    if (cached) {
      setMatrixResult(cached);
      return;
    }

    setBuildingMatrix(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ai/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: list.slice(0, 5).map((p) => ({
            title: p.title,
            authors: p.authors,
            year: p.year,
            venue: p.venue,
            tierLabel: p.journalMetrics?.tierLabel ?? null,
            abstract: p.abstract,
          })),
        }),
      });
      const data = (await res.json()) as {
        matrix?: LiteratureMatrixResult;
        error?: string;
        requireLogin?: boolean;
      };
      if (!res.ok || !data.matrix) {
        setNotice({
          type: "error",
          message: data.error || "Gagal menyusun Matriks Literatur AI.",
        });
        if (data.requireLogin) setShowAuthModal(true);
        return;
      }
      setMatrixResult(data.matrix);
      setCachedMatrix(matrixKey, data.matrix);
    } catch {
      setNotice({
        type: "error",
        message: "Gangguan koneksi saat menyusun Matriks Literatur.",
      });
    } finally {
      setBuildingMatrix(false);
      notifyQuotaUpdated();
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProjectName.trim();
    if (!name || creatingProject) return;
    setCreatingProject(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const data = (await res.json()) as { project: ResearchProjectRecord };
        setProjects((prev) => [data.project, ...prev]);
        setNewProjectName("");
        setShowNewProjectInput(false);
        setSelectedProjectId(data.project.id);
        setActiveTab("bookmarks");
      }
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (selectedProjectId === id) setSelectedProjectId(null);
      setBookmarks((prev) =>
        prev.map((b) => (b.projectId === id ? { ...b, projectId: null } : b))
      );
    }
  };

  const handleUpdateBookmarkMeta = async (
    bookmarkId: string,
    patch: { projectId?: string | null; note?: string | null }
  ) => {
    const res = await fetch(`/api/bookmarks/${bookmarkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = (await res.json()) as { bookmark: BookmarkRecord };
      setBookmarks((prev) =>
        prev.map((b) => (b.id === bookmarkId ? data.bookmark : b))
      );
      setNotice({ type: "success", message: "Perubahan jurnal tersimpan." });
      const pRes = await fetch("/api/projects");
      if (pRes.ok) {
        const pJson = (await pRes.json()) as {
          projects?: ResearchProjectRecord[];
        };
        setProjects(pJson.projects ?? []);
      }
    }
  };

  const handleBulkExport = async (kind: "bib" | "ris" | "docx") => {
    if (filteredBookmarks.length === 0) return;
    const papers: JournalPaper[] = filteredBookmarks.map((b) => ({
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
    }));

    if (kind === "bib") {
      const content = exportCitationsBib(papers);
      triggerBlobDownload(
        new Blob([content], { type: "application/x-bibtex;charset=utf-8" }),
        "daftar-pustaka-smartsari.bib"
      );
      return;
    }

    if (kind === "ris") {
      const content = exportCitationsRis(papers);
      triggerBlobDownload(
        new Blob([content], {
          type: "application/x-research-info-systems;charset=utf-8",
        }),
        "daftar-pustaka-smartsari.ris"
      );
      return;
    }

    setExportingBibDocx(true);
    try {
      const activeProject = projects.find((p) => p.id === selectedProjectId);
      const res = await fetch("/api/bookmarks/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeProject
            ? `Daftar Pustaka — ${activeProject.name}`
            : "Daftar Pustaka SmartSari",
          format: "apa",
          items: filteredBookmarks.map((b, i) => ({
            citation: formatCitation(papers[i], "apa"),
            note: b.note ?? null,
          })),
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        triggerBlobDownload(blob, "daftar-pustaka-smartsari.docx");
      }
    } finally {
      setExportingBibDocx(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    clearAllLocalCache();
    setAuthUser(null);
    setSelectedProjectId(null);
    setBookmarks([]);
    setProjects([]);
    setHistory([]);
    setConversions([]);
    setSearchResult(null);
    setSearchBrief(null);
    setMatrixResult(null);
    setReaderState(null);
    setNetworkState(null);
    setSelectedPapersMap({});
    setSearchSyncBadge(null);
    await reloadWorkspaceData();
  };

  const groupedResults = useMemo(() => {
    if (!searchResult?.papers) return [];
    const rf = resultFilter.trim().toLowerCase();
    const filtered = rf
      ? searchResult.papers.filter(
          (p) =>
            p.title.toLowerCase().includes(rf) ||
            (p.venue || "").toLowerCase().includes(rf) ||
            (p.abstract || "").toLowerCase().includes(rf) ||
            p.authors.some((a) => a.toLowerCase().includes(rf))
        )
      : searchResult.papers;

    const buckets = new Map<JournalTier, JournalPaper[]>();
    for (const paper of filtered) {
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
  }, [searchResult, resultFilter]);

  const toggleSource = (source: SearchSource) => {
    const next = selectedSources.includes(source)
      ? selectedSources.length > 1
        ? selectedSources.filter((s) => s !== source)
        : selectedSources
      : [...selectedSources, source];
    if (next === selectedSources) return;
    setSelectedSources(next);
    if (searchResult && activeTab === "search") {
      void runSearch(
        searchResult.query,
        undefined,
        undefined,
        1,
        false,
        false,
        undefined,
        undefined,
        next
      );
    }
  };

  const handleCreateProjectQuick = async (
    name: string
  ): Promise<ResearchProjectRecord | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { project: ResearchProjectRecord };
      setProjects((prev) => [data.project, ...prev]);
      return data.project;
    } catch {
      return null;
    }
  };

  const handleToggleBookmark = async (
    paper: JournalPaper,
    options?: { projectId?: string | null; forceSave?: boolean }
  ) => {
    const existing = bookmarkedMap.get(paper.paperKey);
    if (existing) {
      if (options?.forceSave) {
        await handleUpdateBookmarkMeta(existing.id, {
          projectId: options.projectId ?? null,
        });
        return;
      }
      const res = await fetch(`/api/bookmarks/${existing.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        setNotice({
          type: "info",
          message: "Jurnal dihapus dari daftar Tersimpan.",
        });
        if (existing.projectId) {
          const pRes = await fetch("/api/projects");
          if (pRes.ok) {
            const pJson = (await pRes.json()) as {
              projects?: ResearchProjectRecord[];
            };
            setProjects(pJson.projects ?? []);
          }
        }
      }
      return;
    }

    const targetProjectId = options?.projectId ?? null;
    const res = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...paper,
        projectId: targetProjectId,
        tierLabel: paper.journalMetrics?.tierLabel ?? null,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { bookmark: BookmarkRecord };
      setBookmarks((prev) => [data.bookmark, ...prev]);
      if (targetProjectId) {
        const projectName =
          projects.find((p) => p.id === targetProjectId)?.name || "Proyek Riset";
        setNotice({
          type: "success",
          message: `Jurnal disimpan ke proyek "${projectName}".`,
        });
        const pRes = await fetch("/api/projects");
        if (pRes.ok) {
          const pJson = (await pRes.json()) as {
            projects?: ResearchProjectRecord[];
          };
          setProjects(pJson.projects ?? []);
        }
      } else {
        setNotice({
          type: "success",
          message: "Jurnal disimpan ke daftar Tersimpan Anda.",
        });
      }
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
          customText: paper.customText ?? undefined,
          mode,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          requireLogin?: boolean;
        };
        setNotice({
          type: "error",
          message:
            err.error || "Gagal mengonversi jurnal ke dokumen Word (.docx).",
        });
        if (err.requireLogin) setShowAuthModal(true);
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
      notifyQuotaUpdated();
    }
  };

  const handleUploadPdfFile = async (file: File) => {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setNotice({
        type: "error",
        message: "Pilih berkas berformat PDF (.pdf).",
      });
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setNotice({
        type: "error",
        message: "Ukuran berkas PDF maksimal 4 MB untuk unggah langsung.",
      });
      return;
    }

    setUploadingPdf(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/pdf/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as {
        paperKey?: string;
        title?: string;
        extractedText?: string;
        error?: string;
      };
      if (!res.ok || !data.paperKey || !data.extractedText) {
        setNotice({
          type: "error",
          message: data.error || "Gagal memproses berkas PDF.",
        });
        return;
      }

      if (uploadedBlobUrlRef.current) {
        URL.revokeObjectURL(uploadedBlobUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(file);
      uploadedBlobUrlRef.current = blobUrl;

      setReaderState({
        paper: {
          paperKey: data.paperKey,
          title: data.title || "Dokumen PDF Pribadi",
          authors: ["Dokumen Pribadi"],
          year: new Date().getFullYear(),
          venue: "PDF Unggahan Pribadi",
          source: "openalex",
          abstract: null,
          pdfUrl: null,
          landingUrl: null,
          doi: null,
          citations: null,
          openAccess: true,
          customText: data.extractedText,
          localPdfUrl: blobUrl,
        },
        autoTranslate: false,
      });
    } catch {
      setNotice({
        type: "error",
        message: "Gagal mengunggah PDF. Periksa koneksi internet Anda.",
      });
    } finally {
      setUploadingPdf(false);
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
        className={`flex items-center gap-2 rounded-full border border-line-strong bg-input px-2.5 transition-all duration-150 focus-within:border-accent-soft/45 focus-within:bg-input-focus focus-within:shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.14)] ${
          compact ? "min-h-[46px] py-1" : "min-h-[54px] py-1.5"
        }`}
      >
        <button
          type="button"
          aria-label="Filter indeks dan tahun"
          onClick={() => setShowFilterMenu((v) => !v)}
          className={`btn-tactile relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
            showFilterMenu ||
            yearFrom ||
            selectedSources.length < ALL_SOURCES.length
              ? "bg-accent/20 text-accent-soft"
              : "text-ink-secondary hover:bg-line-strong hover:text-heading"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {(yearFrom || selectedSources.length < ALL_SOURCES.length) && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-soft" />
          )}
        </button>

        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari jurnal Q1–Q4, SINTA, atau DOI..."
          className="min-w-0 flex-1 bg-transparent text-base text-ink caret-accent-soft placeholder:text-ink-muted focus:outline-none sm:text-sm"
        />

        {/^((https?:\/\/)?(dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+/i.test(
          query.trim()
        ) && (
          <span className="shrink-0 rounded-full border border-accent/45 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-tint">
            DOI
          </span>
        )}

        {query.trim().length > 0 ? (
          <button
            type="button"
            aria-label="Bersihkan kata kunci"
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus();
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-line-strong hover:text-heading"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:inline-block">
            Ctrl+K
          </kbd>
        )}

        <div className="hidden shrink-0 items-center border-l border-line-strong sm:flex">
          <select
            aria-label="Urutkan hasil"
            value={sort}
            onChange={(e) => {
              const nextSort = e.target.value as SortOption;
              setSort(nextSort);
              if (searchResult && activeTab === "search") {
                void runSearch(
                  searchResult.query,
                  undefined,
                  undefined,
                  1,
                  false,
                  false,
                  nextSort
                );
              }
            }}
            className="cursor-pointer whitespace-nowrap bg-transparent py-1 pl-2.5 pr-1.5 text-xs font-medium text-ink-secondary hover:text-heading focus:outline-none"
          >
            <option value="relevance" className="bg-surface text-ink">
              Relevansi
            </option>
            <option value="impact" className="bg-surface text-ink">
              Impact Factor
            </option>
            <option value="newest" className="bg-surface text-ink">
              Terbaru
            </option>
            <option value="citations" className="bg-surface text-ink">
              Sitasi
            </option>
          </select>
        </div>

        <button
          type="submit"
          disabled={searching}
          aria-label="Cari jurnal"
          className="btn-tactile inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
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
        <div className="animate-panel-open absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-line-strong bg-surface p-4 shadow-2xl sm:right-auto sm:w-80">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">
              Filter Pencarian
            </span>
            <button
              type="button"
              onClick={() => setShowFilterMenu(false)}
              className="text-ink-muted hover:text-heading"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="mb-1.5 block text-[11px] text-ink-secondary">
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
                          ? "border-accent bg-accent/15 text-accent-soft"
                          : "border-line-strong bg-elevated text-ink-secondary hover:text-heading"
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
                <span className="mb-1 block text-[11px] text-ink-secondary">
                  Tahun Minimal
                </span>
                <select
                  aria-label="Filter tahun minimal"
                  value={yearFrom}
                  onChange={(e) => {
                    const nextYear = e.target.value;
                    setYearFrom(nextYear);
                    if (searchResult && activeTab === "search") {
                      void runSearch(
                        searchResult.query,
                        undefined,
                        undefined,
                        1,
                        false,
                        false,
                        undefined,
                        nextYear
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-line-strong bg-elevated px-2.5 py-1.5 text-xs text-ink"
                >
                  <option value="">Semua Tahun</option>
                  <option value="2024">Sejak 2024</option>
                  <option value="2022">Sejak 2022</option>
                  <option value="2020">Sejak 2020</option>
                  <option value="2015">Sejak 2015</option>
                </select>
              </div>

              <div className="sm:hidden">
                <span className="mb-1 block text-[11px] text-ink-secondary">
                  Urutkan
                </span>
                <select
                  aria-label="Urutkan hasil seluler"
                  value={sort}
                  onChange={(e) => {
                    const nextSort = e.target.value as SortOption;
                    setSort(nextSort);
                    if (searchResult && activeTab === "search") {
                      void runSearch(
                        searchResult.query,
                        undefined,
                        undefined,
                        1,
                        false,
                        false,
                        nextSort
                      );
                    }
                  }}
                  className="w-full rounded-lg border border-line-strong bg-elevated px-2.5 py-1.5 text-xs text-ink"
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
    <div className="flex min-h-screen bg-canvas text-ink pb-16 md:pb-0">
      {/* Collapsible Left Sidebar */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 md:sticky md:top-0 md:flex md:h-screen ${
          sidebarOpen ? "w-[264px]" : "w-0 overflow-hidden border-r-0"
        }`}
      >
        {/* Sidebar Top Header */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <button
            type="button"
            onClick={resetToHome}
            className="flex items-center gap-2 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png?v=2"
              alt="SmartSari"
              className="h-6 w-6 object-contain drop-shadow-[0_0_8px_rgba(var(--accent-soft-rgb),0.35)]"
            />
            <span className="text-sm font-semibold tracking-[-0.01em] text-ink">
              Smart<span className="text-accent-soft">Sari</span>
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
              className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-chip-active hover:text-heading"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Tutup sidebar"
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-chip-active hover:text-heading"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quiet Pill Navigation */}
        <nav aria-label="Menu utama" className="space-y-0.5 px-2.5">
          <button
            type="button"
            onClick={resetToHome}
            className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === "search" && !searchResult
                ? "bg-chip-active text-heading"
                : "text-ink-secondary hover:bg-elevated hover:text-heading"
            }`}
          >
            <SquarePen className="h-4 w-4 text-accent-soft" />
            <span>Pencarian Baru</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bookmarks")}
            className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === "bookmarks"
                ? "bg-chip-active text-heading"
                : "text-ink-secondary hover:bg-elevated hover:text-heading"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Bookmark className="h-4 w-4" />
              Tersimpan
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink-muted">
              {bookmarks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("conversions")}
            className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === "conversions"
                ? "bg-chip-active text-heading"
                : "text-ink-secondary hover:bg-elevated hover:text-heading"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <FileText className="h-4 w-4" />
              Arsip Word
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink-muted">
              {conversions.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsTab("general")}
            className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-xs font-medium transition-colors ${
              settingsTab !== null
                ? "bg-chip-active text-heading"
                : "text-ink-secondary hover:bg-elevated hover:text-heading"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Settings className="h-4 w-4 text-accent-soft" />
              Pengaturan
            </span>
            {quotaStatus && (
              <span className="font-mono text-[10px] tabular-nums text-ink-muted">
                {quotaStatus.remaining}/{quotaStatus.limit}
              </span>
            )}
          </button>
        </nav>

        {/* Flat Proyek Riset, Arsip Word & Searchable History */}
        <div className="mt-4 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          <section>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-ink-muted">
                Proyek Riset
              </span>
              <button
                type="button"
                onClick={() => setShowNewProjectInput((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent-soft hover:text-accent-tint"
              >
                <Plus className="h-3 w-3" />
                Baru
              </button>
            </div>

            {showNewProjectInput && (
              <form
                onSubmit={(e) => void handleCreateProject(e)}
                className="mb-2 flex items-center gap-1"
              >
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Nama proyek..."
                  className="min-w-0 flex-1 rounded-lg border border-line-strong bg-canvas px-2.5 py-1 text-xs text-heading placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={creatingProject || !newProjectName.trim()}
                  className="rounded-lg bg-accent px-2 py-1 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  Simpan
                </button>
              </form>
            )}

            {projects.length === 0 ? (
              <p className="px-1 text-[11px] text-ink-muted">
                Belum ada proyek riset.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {projects.map((proj) => (
                  <li
                    key={proj.id}
                    className="group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-elevated"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setActiveTab("bookmarks");
                      }}
                      className={`flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs ${
                        activeTab === "bookmarks" &&
                        selectedProjectId === proj.id
                          ? "font-semibold text-accent-soft"
                          : "text-ink-body group-hover:text-heading"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                        <span className="truncate">{proj.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                        {proj.bookmarkCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus proyek ${proj.name}`}
                      onClick={() => void handleDeleteProject(proj.id)}
                      className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-ink-muted">
                Riwayat
              </span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmClearHistory) {
                      setConfirmClearHistory(true);
                      return;
                    }
                    setConfirmClearHistory(false);
                    void handleClearHistory();
                  }}
                  className={`text-[11px] transition-colors ${
                    confirmClearHistory
                      ? "font-semibold text-danger"
                      : "text-ink-muted hover:text-danger"
                  }`}
                >
                  {confirmClearHistory ? "Yakin hapus?" : "Hapus"}
                </button>
              )}
            </div>

            {(showSidebarSearch || history.length > 3) && (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-muted" />
                <input
                  ref={sidebarSearchRef}
                  type="search"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  placeholder="Cari riwayat..."
                  className="w-full rounded-lg border border-line bg-canvas py-1.5 pl-7 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </div>
            )}

            {loadingSidebar ? (
              <div className="space-y-1.5 px-1">
                <div className="h-5 rounded bg-elevated" />
                <div className="h-5 rounded bg-elevated" />
              </div>
            ) : history.length === 0 ? (
              <p className="px-1 text-xs text-ink-muted">
                Belum ada riwayat.
              </p>
            ) : filteredHistory.length === 0 ? (
              <p className="px-1 text-[11px] text-ink-muted">
                Tidak cocok dengan &ldquo;{historyFilter}&rdquo;.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filteredHistory.slice(0, 14).map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-elevated"
                  >
                    <button
                      type="button"
                      onClick={() => void runSearch(item.query)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs text-ink-body group-hover:text-heading"
                    >
                      <span className="truncate">{item.query}</span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                        {formatRelativeTimeId(item.createdAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus riwayat ${item.query}`}
                      onClick={() => void handleDeleteHistoryItem(item.id)}
                      className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Account & Cross-Device Sync Footer */}
        <div className="space-y-2 border-t border-line p-3">
          {quotaStatus && (
            <div className="rounded-xl border border-line bg-canvas px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1 font-medium text-ink-body">
                  <Zap className="h-3 w-3 text-accent-soft" />
                  Kuota AI Harian
                </span>
                <span
                  className={`font-mono font-semibold ${
                    quotaStatus.remaining === 0
                      ? "text-danger"
                      : quotaStatus.remaining <= 2
                        ? "text-warn"
                        : "text-ok"
                  }`}
                >
                  {quotaStatus.remaining}/{quotaStatus.limit}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  className={`h-full rounded-full transition-all ${
                    quotaStatus.remaining === 0
                      ? "bg-danger"
                      : quotaStatus.remaining <= 2
                        ? "bg-warn"
                        : "bg-accent"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((quotaStatus.remaining / quotaStatus.limit) * 100)
                    )}%`,
                  }}
                />
              </div>
              {quotaStatus.tier === "guest" && !authUser && (
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="mt-1.5 text-[10px] font-medium text-accent-soft hover:underline"
                >
                  Daftar gratis untuk kuota 100×/hari →
                </button>
              )}
            </div>
          )}

          {authUser ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-elevated px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-soft">
                  <User className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-heading">
                    {authUser.name}
                  </p>
                  <p className="truncate text-[10px] text-ink-secondary">
                    Tersinkronisasi
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setSettingsTab("account")}
                  aria-label="Pengaturan akun dan sandi"
                  title="Pengaturan akun & sandi"
                  className="rounded-lg p-1.5 text-ink-secondary hover:bg-chip-active hover:text-heading"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  aria-label="Keluar dari akun"
                  title="Keluar"
                  className="rounded-lg p-1.5 text-ink-secondary hover:bg-chip-active hover:text-danger"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="btn-tactile flex w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-elevated px-3 py-2 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading"
            >
              <Cloud className="h-3.5 w-3.5 text-accent-soft" />
              <span>Masuk &amp; Sinkronkan</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              clearAllLocalCache();
              setSearchSyncBadge(null);
              setNotice({
                type: "info",
                message:
                  "Cache lokal dibersihkan. Pencarian berikutnya akan mengambil data segar.",
              });
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-ink-muted transition-colors hover:bg-elevated hover:text-ink-body"
          >
            <Trash2 className="h-3 w-3" />
            <span>Bersihkan Cache Lokal</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div
        className={`flex min-w-0 flex-1 flex-col ${
          isLanding ? "ambient-rose-glow" : ""
        }`}
      >
        {/* Top Utility Bar */}
        <header className="flex items-center justify-between gap-2 px-3.5 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {!sidebarOpen && (
              <button
                type="button"
                aria-label="Buka sidebar"
                onClick={() => setSidebarOpen(true)}
                className="hidden rounded-lg p-1.5 text-ink-secondary transition-colors hover:bg-elevated hover:text-heading md:inline-flex"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={resetToHome}
              className="flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap md:hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-mark.png?v=2"
                alt="SmartSari"
                className="h-6 w-6 shrink-0 object-contain drop-shadow-[0_0_8px_rgba(var(--accent-soft-rgb),0.35)]"
              />
              <span className="text-sm font-semibold text-heading">
                Smart<span className="text-accent-soft">Sari</span>
              </span>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <input
              ref={pdfUploadInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void handleUploadPdfFile(file);
              }}
            />
            <button
              type="button"
              disabled={uploadingPdf}
              onClick={() => pdfUploadInputRef.current?.click()}
              title="Unggah PDF pribadi (maks. 4 MB) untuk baca, terjemahan ID, tanya AI, dan ekspor Word"
              className="btn-tactile inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading disabled:opacity-60 sm:min-h-[34px] sm:px-3"
            >
              {uploadingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-soft" />
              ) : (
                <Upload className="h-3.5 w-3.5 text-accent-soft" />
              )}
              <span className="hidden sm:inline">Upload PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            {quotaStatus && (
              <button
                type="button"
                onClick={() => setSettingsTab("general")}
                title={`Sisa kuota AI harian: ${quotaStatus.remaining} dari ${quotaStatus.limit} (klik untuk detail)`}
                className={`hidden h-8 items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 font-mono text-[11px] font-semibold transition-colors hover:border-accent-soft/45 ${
                  !sidebarOpen ? "sm:inline-flex" : "sm:inline-flex md:hidden"
                } ${
                  quotaStatus.remaining === 0
                    ? "text-danger"
                    : quotaStatus.remaining <= 2
                      ? "text-warn"
                      : "text-ok"
                }`}
              >
                <Zap className="h-3 w-3 text-accent-soft" />
                {quotaStatus.remaining}/{quotaStatus.limit}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              aria-label="Pintasan keyboard dan tips"
              title="Pintasan & Tips (?)"
              className="btn-tactile hidden h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-secondary hover:border-accent-soft/45 hover:text-heading sm:inline-flex"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsTab("general")}
              aria-label="Pengaturan tema, kuota, dan akun"
              title="Pengaturan & Tema"
              className="btn-tactile inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-secondary hover:border-accent-soft/45 hover:text-heading sm:h-8 sm:w-8"
            >
              <Settings className="h-4 w-4" />
            </button>
            <PwaRegistrar />
            {authUser ? (
              <button
                type="button"
                onClick={() => setSettingsTab("account")}
                className="btn-tactile inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-heading hover:border-accent-soft/45 md:hidden"
              >
                <User className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                <span className="max-w-[68px] truncate">{authUser.name}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="btn-tactile inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading md:hidden"
              >
                <Cloud className="h-3.5 w-3.5 text-accent-soft" />
                <span>Masuk</span>
              </button>
            )}
          </div>
        </header>

        {/* Sticky Search Header When Showing Results */}
        {activeTab === "search" && !isLanding && (
          <div className="sticky top-0 z-20 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur-md sm:px-6">
            {renderPillSearchBar(true)}
          </div>
        )}

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 sm:px-8">
          {isOffline && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/35 bg-warn/10 px-4 py-2 text-xs text-warn-soft">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>
                Anda sedang offline — menampilkan data tersimpan dari cache
                lokal.
              </span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                notice.type === "error"
                  ? "border-danger/35 bg-danger/10 text-danger-soft"
                  : notice.type === "success"
                    ? "border-accent/35 bg-accent/12 text-ink-strong"
                    : "border-line-strong bg-surface text-ink-strong"
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-accent-soft" />
                <span>{notice.message}</span>
              </div>
              <div className="flex items-center gap-2">
                {getSafeHttpUrl(notice.actionUrl) && (
                  <a
                    href={getSafeHttpUrl(notice.actionUrl)!}
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
                  className="rounded p-1 hover:bg-line-strong/40"
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
                  src="/logo-mark.png?v=2"
                  alt="SmartSari"
                  className="h-20 w-20 object-contain drop-shadow-[0_0_22px_rgba(var(--accent-rgb),0.28)] sm:h-24 sm:w-24"
                />
                <span className="rounded-full border border-line bg-surface/80 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-ink-muted">
                  by <strong className="font-semibold text-ink-body">AirEvo</strong>
                </span>
              </div>

              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent-tint">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />
                Q1–Q4 Internasional · SINTA 1–6 · Open Access
              </div>

              <h1 className="mb-6 text-center text-[26px] font-semibold tracking-[-0.025em] text-ink sm:text-[36px]">
                Mau cari jurnal apa hari ini?
              </h1>

              {renderPillSearchBar(false)}

              {/* 2-Pill Mode Toggle */}
              <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1">
                <button
                  type="button"
                  title="Tampilkan seluruh jurnal relevan, termasuk abstrak & DOI"
                  onClick={() => setPdfOnly(false)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ${
                    !pdfOnly
                      ? "bg-chip-active text-heading"
                      : "text-ink-secondary hover:text-heading"
                  }`}
                >
                  Semua Referensi
                </button>
                <button
                  type="button"
                  title="Khusus artikel yang memiliki berkas PDF terbuka siap baca"
                  onClick={() => setPdfOnly(true)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:py-1 ${
                    pdfOnly
                      ? "bg-accent text-white"
                      : "text-ink-secondary hover:text-heading"
                  }`}
                >
                  Akses PDF Penuh
                </button>
              </div>

              {/* Minimal Vertical Starter List */}
              <div className="mt-7 w-full max-w-md space-y-1.5">
                {STARTER_SUGGESTIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.query}
                      type="button"
                      onClick={() => void runSearch(item.query)}
                      className="btn-tactile flex w-full items-center gap-3 rounded-xl border border-line/80 bg-surface/75 px-3.5 py-2.5 text-left text-xs text-ink-body transition-colors hover:border-line-strong hover:bg-elevated hover:text-heading"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-accent-soft" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {history.length > 0 && (
                <div className="mt-6 flex w-full max-w-xl flex-wrap items-center justify-center gap-1.5">
                  <span className="mr-1 text-[11px] text-ink-muted">
                    Terakhir dicari:
                  </span>
                  {history.slice(0, 5).map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => void runSearch(h.query)}
                      className="btn-tactile max-w-[180px] truncate rounded-full border border-line-strong bg-surface px-3 py-1 text-[11px] text-ink-body hover:border-accent-soft/45 hover:text-heading"
                    >
                      {h.query}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "search" && !isLanding && (
            <div>
              {searchError && (
                <div className="mb-4 rounded-xl border border-danger/35 bg-danger/10 p-3.5 text-sm text-danger-soft">
                  {searchError}
                </div>
              )}

              {searching && (
                <div className="divide-y divide-line">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="animate-pulse py-5 sm:grid sm:grid-cols-[88px_1fr] sm:gap-5"
                    >
                      <div className="mb-2 flex gap-2 sm:mb-0 sm:block sm:space-y-1.5">
                        <div className="h-5 w-14 rounded-md bg-elevated" />
                        <div className="h-4 w-12 rounded bg-surface" />
                      </div>
                      <div>
                        <div className="h-5 w-4/5 rounded bg-elevated" />
                        <div className="mt-2 h-3.5 w-1/2 rounded bg-surface" />
                        <div className="mt-3 h-12 w-full rounded-lg bg-surface" />
                        <div className="mt-3 flex gap-2">
                          <div className="h-7 w-24 rounded-full bg-elevated" />
                          <div className="h-7 w-28 rounded-full bg-surface" />
                          <div className="h-7 w-20 rounded-full bg-surface" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchResult && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>
                        Menampilkan{" "}
                        <strong className="font-mono tabular-nums text-heading">
                          {searchResult.total}
                        </strong>{" "}
                        artikel untuk &ldquo;{searchResult.query}&rdquo;
                      </span>
                      {searchSyncBadge && (
                        <span className="rounded-full border border-accent/35 bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent-tint">
                          {searchSyncBadge}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void runSearch(
                            searchResult.query,
                            undefined,
                            undefined,
                            1,
                            false,
                            true
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-secondary hover:border-accent-soft/45 hover:text-heading"
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        Cek Baru
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(window.location.href)
                            .then(() => {
                              setCopiedShareLink(true);
                              setTimeout(() => setCopiedShareLink(false), 1800);
                            })
                            .catch(() => {});
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2 py-0.5 text-[10px] font-medium text-ink-secondary hover:border-accent-soft/45 hover:text-heading"
                      >
                        {copiedShareLink ? (
                          <>
                            <Check className="h-2.5 w-2.5 text-ok" />
                            <span className="text-ok">Tautan tersalin</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="h-2.5 w-2.5" />
                            <span>Bagikan</span>
                          </>
                        )}
                      </button>
                    </div>
                    <span
                      title={searchResult.sourceStats
                        .map((st) => `${st.source}: ${st.ok ? st.count : "err"}`)
                        .join(" · ")}
                      className="cursor-help text-[11px] text-ink-muted"
                    >
                      {
                        searchResult.sourceStats.filter((st) => st.ok).length
                      }{" "}
                      indeks aktif
                    </span>
                  </div>

                  {/* Unified Tier + PDF Filter Chips & Quick Sort/Filter Row */}
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {TIER_PRESETS.map((preset) => {
                        const active = tierPreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setTierPreset(preset.id);
                              void runSearch(
                                searchResult.query,
                                undefined,
                                preset.id,
                                1,
                                false
                              );
                            }}
                            className={`btn-tactile rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? "bg-accent text-white"
                                : "border border-line-strong bg-surface text-ink-secondary hover:border-accent-soft/40 hover:text-heading"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}

                      <span
                        aria-hidden="true"
                        className="mx-0.5 hidden h-4 w-px bg-line-strong sm:inline-block"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const nextPdfOnly = !pdfOnly;
                          setPdfOnly(nextPdfOnly);
                          void runSearch(
                            searchResult.query,
                            nextPdfOnly,
                            undefined,
                            1,
                            false
                          );
                        }}
                        className={`btn-tactile inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          pdfOnly
                            ? "border border-ok/40 bg-ok/15 text-ok-soft"
                            : "border border-line-strong bg-surface text-ink-secondary hover:border-ok/40 hover:text-heading"
                        }`}
                      >
                        <FileText className="h-3 w-3" />
                        <span>Akses PDF Penuh</span>
                      </button>

                      {(yearFrom || selectedSources.length < ALL_SOURCES.length) && (
                        <button
                          type="button"
                          onClick={() => {
                            const allSrc: SearchSource[] = [
                              "openalex",
                              "europepmc",
                              "crossref",
                            ];
                            setYearFrom("");
                            setSelectedSources(allSrc);
                            void runSearch(
                              searchResult.query,
                              undefined,
                              undefined,
                              1,
                              false,
                              false,
                              undefined,
                              "",
                              allSrc
                            );
                          }}
                          className="btn-tactile inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink-secondary hover:border-accent-soft/45 hover:text-heading"
                        >
                          <X className="h-3 w-3" />
                          <span>Reset</span>
                        </button>
                      )}

                      {searchResult.papers.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const topFive = groupedResults
                              .flatMap((g) => g.papers)
                              .slice(0, 5);
                            const nextMap: Record<string, JournalPaper> = {};
                            for (const p of topFive) {
                              nextMap[p.paperKey] = p;
                            }
                            setSelectedPapersMap(nextMap);
                          }}
                          className="btn-tactile inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/12 px-2.5 py-1 text-xs font-medium text-accent-tint hover:border-accent-soft hover:bg-accent/20"
                        >
                          <Table2 className="h-3 w-3" />
                          <span>Pilih Top 5</span>
                        </button>
                      )}
                    </div>

                    <div
                      className={
                        searchResult.papers.length > 3
                          ? "flex shrink-0 items-center gap-2 sm:w-auto"
                          : "flex items-center sm:hidden"
                      }
                    >
                      <select
                        aria-label="Urutkan hasil di seluler"
                        value={sort}
                        onChange={(e) => {
                          const nextSort = e.target.value as SortOption;
                          setSort(nextSort);
                          if (searchResult && activeTab === "search") {
                            void runSearch(
                              searchResult.query,
                              undefined,
                              undefined,
                              1,
                              false,
                              false,
                              nextSort
                            );
                          }
                        }}
                        className="min-h-[36px] shrink-0 cursor-pointer rounded-full border border-line-strong bg-surface px-3 text-xs font-medium text-ink-strong focus:border-accent-soft focus:outline-none sm:hidden"
                      >
                        <option value="relevance">Relevansi</option>
                        <option value="impact">Impact</option>
                        <option value="newest">Terbaru</option>
                        <option value="citations">Sitasi</option>
                      </select>

                      {searchResult.papers.length > 3 && (
                        <div className="relative min-w-0 flex-1 sm:w-36 lg:w-40">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                          <input
                            type="search"
                            value={resultFilter}
                            onChange={(e) => setResultFilter(e.target.value)}
                            placeholder="Saring hasil..."
                            className="min-h-[36px] w-full rounded-full border border-line-strong bg-surface py-1 pl-8 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-accent-soft focus:outline-none sm:min-h-[30px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Compact AI Research Brief & Query Optimizer */}
                  {searchResult.papers.length > 0 && (
                    <div
                      className={`mb-4 rounded-xl border border-line-strong bg-surface ${
                        searchBrief ? "p-4" : "px-3.5 py-2.5"
                      }`}
                    >
                      {!searchBrief ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent-soft" />
                            <span className="font-medium text-ink-strong">
                              Ringkasan AI &amp; saran kata kunci dari hasil
                              teratas
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={loadingBrief}
                            onClick={() => void handleGenerateBrief()}
                            className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                          >
                            {loadingBrief ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <FileText className="h-3 w-3" />
                            )}
                            {loadingBrief ? "Menganalisis..." : "Analisis AI"}
                          </button>
                        </div>
                      ) : (
                        <div className="animate-panel-open space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-accent-soft" />
                              <span className="text-xs font-semibold text-heading">
                                Intisari Riset AI
                              </span>
                              <span className="text-[11px] font-medium text-ink-secondary">
                                · SmartSari by AirEvo
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSearchBrief(null)}
                              aria-label="Tutup ringkasan AI"
                              className="rounded-lg p-1 text-ink-secondary hover:bg-elevated hover:text-heading"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <p className="text-sm leading-relaxed text-ink-strong">
                            <FootnoteLinkedText
                              text={searchBrief.overview}
                              idPrefix="search-paper-"
                              maxIndex={searchResult.papers.length}
                              titles={searchResult.papers.map((p) => p.title)}
                            />
                          </p>

                          {searchBrief.keyFindings.length > 0 && (
                            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-ink-body">
                              {searchBrief.keyFindings.map((item, idx) => (
                                <li key={idx}>
                                  <FootnoteLinkedText
                                    text={item}
                                    idPrefix="search-paper-"
                                    maxIndex={searchResult.papers.length}
                                    titles={searchResult.papers.map(
                                      (p) => p.title
                                    )}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="grid gap-2.5 pt-1 text-xs sm:grid-cols-2">
                            <div className="rounded-xl border border-line bg-canvas p-3">
                              <span className="block text-[11px] font-semibold text-accent-soft">
                                Tren Metode
                              </span>
                              <p className="mt-1 text-ink-body">
                                {searchBrief.dominantMethods}
                              </p>
                            </div>
                            <div className="rounded-xl border border-line bg-canvas p-3">
                              <span className="block text-[11px] font-semibold text-accent-soft">
                                Rekomendasi Baca Pertama
                              </span>
                              <p className="mt-1 text-ink-body">
                                {searchBrief.topRecommendation}
                              </p>
                            </div>
                          </div>

                          {searchBrief.suggestedQueries.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              <span className="text-[11px] font-medium text-ink-secondary">
                                Saran pencarian lebih tajam:
                              </span>
                              {searchBrief.suggestedQueries.map((sq, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => void runSearch(sq.query)}
                                  className="btn-tactile rounded-full border border-accent/35 bg-accent/12 px-3 py-1 text-[11px] font-medium text-accent-tint hover:border-accent-soft hover:bg-accent/20"
                                >
                                  {sq.label}: &ldquo;{sq.query}&rdquo;
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {searchResult.papers.length === 0 ? (
                    <div className="rounded-xl border border-line bg-surface p-8 text-center">
                      <p className="text-base font-semibold text-heading">
                        Tidak ada artikel yang cocok
                      </p>
                      <p className="mt-1 text-sm text-ink-secondary">
                        Coba kata kunci lebih umum atau nonaktifkan filter Akses
                        PDF Penuh.
                      </p>
                    </div>
                  ) : (
                    <>
                      {groupedResults.length > 1 && (
                        <nav
                          aria-label="Lompat ke peringkat"
                          className="sticky top-[71px] z-10 -mx-1 mb-5 flex items-center gap-1.5 overflow-x-auto border-b border-line bg-canvas/95 px-1 py-2 backdrop-blur-sm"
                        >
                          <span className="shrink-0 text-[11px] font-medium text-ink-muted">
                            Lompat:
                          </span>
                          {groupedResults.map((group) => (
                            <a
                              key={group.tier}
                              href={`#rank-${group.tier}`}
                              className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                                group.meta.priority
                                  ? "bg-accent text-white hover:bg-accent-hover"
                                  : "border border-line-strong bg-surface text-ink-secondary hover:border-accent hover:text-heading"
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
                                  ? "border-b-2 border-accent"
                                  : "border-b border-line-strong"
                              }`}
                            >
                              <div className="flex items-baseline gap-2.5">
                                <span
                                  className={`shrink-0 font-mono text-xs font-bold ${
                                    group.meta.priority
                                      ? "text-accent-soft"
                                      : "text-ink"
                                  }`}
                                >
                                  {group.meta.badge}
                                </span>
                                <h2 className="text-sm font-semibold text-ink">
                                  {group.meta.title}
                                </h2>
                              </div>
                              <span className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-ink-muted">
                                {group.papers.length} artikel
                              </span>
                            </div>

                            <div className="divide-y divide-line">
                              {group.papers.map((paper) => {
                                const savedEntry = bookmarkedMap.get(
                                  paper.paperKey
                                );
                                const globalIdx =
                                  (searchResult.papers.findIndex(
                                    (p) => p.paperKey === paper.paperKey
                                  ) ?? -1) + 1;
                                return (
                                  <div
                                    key={paper.paperKey}
                                    id={
                                      globalIdx > 0
                                        ? `search-paper-${globalIdx}`
                                        : undefined
                                    }
                                    className="scroll-mt-24"
                                  >
                                    <PaperCard
                                      paper={paper}
                                      isBookmarked={Boolean(savedEntry)}
                                      onToggleBookmark={handleToggleBookmark}
                                      onDownloadPdf={handleDownloadPdf}
                                      onOpenReader={(
                                        p,
                                        autoTranslate = false
                                      ) =>
                                        setReaderState({
                                          paper: p,
                                          autoTranslate,
                                        })
                                      }
                                      onConvertWord={handleConvertWord}
                                      downloadingPdfKey={downloadingPdfKey}
                                      convertingKey={convertingKey}
                                      selectedForMatrix={Boolean(
                                        selectedPapersMap[paper.paperKey]
                                      )}
                                      onToggleSelectMatrix={
                                        handleToggleSelectMatrix
                                      }
                                      onOpenNetwork={(p) =>
                                        setNetworkState({
                                          paper: p,
                                          trail: [p],
                                          activeTab: "citing",
                                        })
                                      }
                                      bookmarkId={savedEntry?.id}
                                      projectId={savedEntry?.projectId ?? null}
                                      note={savedEntry?.note ?? null}
                                      projects={projects}
                                      onUpdateBookmarkMeta={
                                        handleUpdateBookmarkMeta
                                      }
                                      onCreateProjectQuick={
                                        handleCreateProjectQuick
                                      }
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>

                      {searchResult.hasMore && (
                        <div className="mt-8 flex justify-center">
                          <button
                            type="button"
                            disabled={loadingMore}
                            onClick={() =>
                              void runSearch(
                                searchResult.query,
                                undefined,
                                undefined,
                                (searchResult.page ?? 1) + 1,
                                true
                              )
                            }
                            className="btn-tactile inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-6 py-2.5 text-xs font-semibold text-ink hover:border-accent-soft hover:text-heading disabled:opacity-60"
                          >
                            {loadingMore && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-soft" />
                            )}
                            {loadingMore
                              ? "Memuat jurnal berikutnya..."
                              : "Muat Lebih Banyak Jurnal"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "bookmarks" && (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-heading">
                    {selectedProjectId
                      ? projects.find((p) => p.id === selectedProjectId)
                          ?.name || "Proyek Riset"
                      : "Jurnal Tersimpan"}{" "}
                    ({filteredBookmarks.length})
                  </h2>
                  {selectedProjectId && (
                    <button
                      type="button"
                      onClick={() => setSelectedProjectId(null)}
                      className="rounded-full border border-line-strong bg-elevated px-2.5 py-0.5 text-[11px] text-ink-secondary hover:text-heading"
                    >
                      Lihat Semua
                    </button>
                  )}
                </div>
                {bookmarks.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                    <input
                      type="search"
                      value={bookmarksFilter}
                      onChange={(e) => setBookmarksFilter(e.target.value)}
                      placeholder="Cari di jurnal tersimpan..."
                      className="min-h-[38px] w-full rounded-full border border-line-strong bg-surface py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none sm:text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedProjectId(null)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    !selectedProjectId
                      ? "bg-accent text-white"
                      : "border border-line-strong bg-surface text-ink-secondary hover:text-heading"
                  }`}
                >
                  Semua ({bookmarks.length})
                </button>
                {projects.map((proj) => (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => setSelectedProjectId(proj.id)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      selectedProjectId === proj.id
                        ? "bg-accent text-white"
                        : "border border-line-strong bg-surface text-ink-secondary hover:text-heading"
                    }`}
                  >
                    <FolderOpen className="h-3 w-3" />
                    <span>{proj.name}</span>
                    <span className="font-mono text-[10px] opacity-80">
                      {proj.bookmarkCount}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowNewProjectInput((v) => !v)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-medium text-accent-soft hover:border-accent-soft"
                >
                  <Plus className="h-3 w-3" />
                  <span>Proyek</span>
                </button>
              </div>

              {showNewProjectInput && (
                <form
                  onSubmit={(e) => void handleCreateProject(e)}
                  className="mb-3 flex max-w-xs items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Nama proyek baru..."
                    className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-heading placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={creatingProject || !newProjectName.trim()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Simpan
                  </button>
                </form>
              )}

              {filteredBookmarks.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleBulkExport("bib")}
                    className="btn-tactile inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
                  >
                    <FileDown className="h-3.5 w-3.5 text-accent-soft" />
                    Ekspor .bib
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkExport("ris")}
                    className="btn-tactile inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
                  >
                    <FileDown className="h-3.5 w-3.5 text-accent-soft" />
                    Ekspor .ris
                  </button>
                  <button
                    type="button"
                    disabled={exportingBibDocx}
                    onClick={() => void handleBulkExport("docx")}
                    className="btn-tactile inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading disabled:opacity-60"
                  >
                    {exportingBibDocx ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-soft" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-accent-soft" />
                    )}
                    Daftar Pustaka .docx
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = filteredBookmarks
                        .map((b, idx) => {
                          const p: JournalPaper = {
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
                          };
                          return `${idx + 1}. ${formatCitation(p, "apa")}`;
                        })
                        .join("\n\n");
                      void navigator.clipboard
                        .writeText(text)
                        .then(() => {
                          setCopiedAllApa(true);
                          setTimeout(() => setCopiedAllApa(false), 1800);
                        })
                        .catch(() => {});
                    }}
                    className="btn-tactile inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
                  >
                    {copiedAllApa ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-ok" />
                        <span className="text-ok">Semua APA tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-accent-soft" />
                        <span>Salin Semua (APA)</span>
                      </>
                    )}
                  </button>
                  {filteredBookmarks.length >= 2 && (
                    <button
                      type="button"
                      disabled={buildingMatrix}
                      onClick={() =>
                        void handleBuildMatrix(
                          filteredBookmarks.slice(0, 5).map((b) => ({
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
                          }))
                        )
                      }
                      className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60 sm:ml-auto"
                    >
                      {buildingMatrix ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Table2 className="h-3.5 w-3.5" />
                      )}
                      Matriks Literatur AI ({Math.min(5, filteredBookmarks.length)})
                    </button>
                  )}
                </div>
              )}

              {bookmarks.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface p-8 text-center">
                  <p className="text-base font-semibold text-heading">
                    Belum ada jurnal tersimpan
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Klik &ldquo;Simpan&rdquo; pada artikel hasil pencarian untuk
                    menyimpannya ke koleksi Anda.
                  </p>
                </div>
              ) : filteredBookmarks.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-secondary">
                  Tidak ada jurnal tersimpan yang cocok dengan filter saat ini.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {filteredBookmarks.map((b) => {
                    const normalizedTier = b.tierLabel
                      ? (b.tierLabel
                          .toUpperCase()
                          .replace(/\s+/g, "") as JournalTier)
                      : null;
                    const mappedTier =
                      normalizedTier &&
                      TIER_PRIORITY_ORDER.includes(normalizedTier)
                        ? normalizedTier
                        : undefined;
                    const mappedPaper: JournalPaper = {
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
                      journalMetrics: b.tierLabel
                        ? {
                            primaryTier: mappedTier ?? "Q1",
                            tierLabel: b.tierLabel,
                            impactFactor: 0,
                            hIndex: 0,
                            issn: null,
                          }
                        : undefined,
                    };
                    return (
                      <PaperCard
                        key={b.id}
                        paper={mappedPaper}
                        isBookmarked={true}
                        onToggleBookmark={handleToggleBookmark}
                        onDownloadPdf={handleDownloadPdf}
                        onOpenReader={(p, autoTranslate = false) =>
                          setReaderState({ paper: p, autoTranslate })
                        }
                        onConvertWord={handleConvertWord}
                        downloadingPdfKey={downloadingPdfKey}
                        convertingKey={convertingKey}
                        selectedForMatrix={Boolean(
                          selectedPapersMap[b.paperKey]
                        )}
                        onToggleSelectMatrix={handleToggleSelectMatrix}
                        onOpenNetwork={(p) =>
                                    setNetworkState({
                                      paper: p,
                                      trail: [p],
                                      activeTab: "citing",
                                    })
                                  }
                        bookmarkId={b.id}
                        projectId={b.projectId}
                        note={b.note}
                        onCreateProjectQuick={handleCreateProjectQuick}
                        projects={projects}
                        onUpdateBookmarkMeta={handleUpdateBookmarkMeta}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {activeTab === "conversions" && (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <h2 className="text-lg font-semibold text-heading">
                  Arsip Konversi Word ({conversions.length})
                </h2>
                {conversions.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                    <input
                      type="search"
                      value={conversionsFilter}
                      onChange={(e) => setConversionsFilter(e.target.value)}
                      placeholder="Cari di arsip Word..."
                      className="min-h-[38px] w-full rounded-full border border-line-strong bg-surface py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none sm:text-xs"
                    />
                  </div>
                )}
              </div>

              {conversions.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface p-8 text-center">
                  <p className="text-base font-semibold text-heading">
                    Belum ada arsip konversi Word
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Pilih salah satu artikel lalu klik &ldquo;Ekspor Word&rdquo;
                    atau &ldquo;Terjemahkan ID&rdquo;.
                  </p>
                </div>
              ) : filteredConversions.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-secondary">
                  Tidak ada arsip Word yang cocok dengan &ldquo;
                  {conversionsFilter}&rdquo;.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {filteredConversions.map((conv) => (
                    <div
                      key={conv.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                          <span className="rounded-md bg-accent/15 px-2 py-0.5 font-medium text-accent-soft">
                            {MODE_BADGE[conv.mode] || conv.mode}
                          </span>
                          <span className="text-[11px] font-medium text-ink-secondary">
                            SmartSari by AirEvo
                          </span>
                          {conv.year && (
                            <span className="font-mono tabular-nums">
                              {conv.year}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-ink sm:text-base">
                          {conv.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/conversions/${conv.id}/download`}
                          className="btn-tactile inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          Unduh .docx
                        </a>
                        <button
                          type="button"
                          aria-label="Hapus arsip konversi"
                          onClick={() => void handleDeleteConversion(conv.id)}
                          className="min-h-[38px] rounded-full border border-line-strong p-2 text-ink-muted hover:border-danger/40 hover:text-danger"
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
              <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
                <h2 className="text-lg font-semibold text-heading">
                  Riwayat Pencarian ({history.length})
                </h2>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmClearHistory) {
                        setConfirmClearHistory(true);
                        return;
                      }
                      setConfirmClearHistory(false);
                      void handleClearHistory();
                    }}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    {confirmClearHistory ? "Klik lagi untuk hapus semua" : "Hapus Semua"}
                  </button>
                )}
              </div>
              {history.length > 0 && (
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="search"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder="Cari riwayat pencarian..."
                    className="min-h-[42px] w-full rounded-full border border-line-strong bg-surface py-2 pl-10 pr-3 text-base text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none sm:text-sm"
                  />
                </div>
              )}
              {history.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface p-8 text-center">
                  <p className="text-sm text-ink-secondary">
                    Belum ada riwayat pencarian.
                  </p>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-secondary">
                  Tidak ada riwayat yang cocok dengan &ldquo;{historyFilter}
                  &rdquo;.
                </div>
              ) : (
                <ul className="divide-y divide-line">
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
                        <span className="truncate font-medium text-ink">
                          {item.query}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-ink-muted">
                          {formatRelativeTimeId(item.createdAt)} ·{" "}
                          {item.resultCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Hapus riwayat ${item.query}`}
                        onClick={() => void handleDeleteHistoryItem(item.id)}
                        className="min-h-[38px] min-w-[38px] rounded-full p-2 text-ink-muted hover:text-danger"
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

        <footer className="mx-auto mt-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-4 text-[11px] text-ink-muted sm:px-8">
          <span>
            &copy; 2026{" "}
            <strong className="font-semibold text-ink-secondary">
              SmartSari by AirEvo
            </strong>
            . Seluruh hak cipta dilindungi.
          </span>
          <nav
            aria-label="Tautan hukum dan kontak"
            className="flex flex-wrap items-center gap-4"
          >
            <Link
              href="/ketentuan"
              className="transition-colors hover:text-accent-soft"
            >
              Ketentuan
            </Link>
            <Link
              href="/privasi"
              className="transition-colors hover:text-accent-soft"
            >
              Privasi
            </Link>
            <Link
              href="/lisensi"
              className="transition-colors hover:text-accent-soft"
            >
              Lisensi &amp; Atribusi
            </Link>
            <Link
              href="/kontak"
              className="transition-colors hover:text-accent-soft"
            >
              Kontak &amp; Bantuan
            </Link>
          </nav>
        </footer>
      </div>

      {/* Floating Scroll-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          aria-label="Kembali ke atas"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="btn-tactile fixed bottom-20 right-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-elevated text-accent-soft shadow-lg hover:border-accent md:bottom-6 md:right-6"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      )}

      {/* Mobile Sticky Bottom Navigation */}
      <nav
        aria-label="Navigasi seluler"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-[10px] font-semibold ${
            activeTab === "search" && settingsTab === null
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          <Search className="h-4 w-4" />
          <span>Cari</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bookmarks")}
          className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-[10px] font-semibold ${
            activeTab === "bookmarks" && settingsTab === null
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          <span className="relative">
            <Bookmark className="h-4 w-4" />
            {bookmarks.length > 0 && (
              <span className="absolute -right-2.5 -top-1 rounded-full bg-accent px-1 font-mono text-[9px] leading-tight text-white">
                {bookmarks.length}
              </span>
            )}
          </span>
          <span>Simpan</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("conversions")}
          className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-[10px] font-semibold ${
            activeTab === "conversions" && settingsTab === null
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          <span className="relative">
            <FileText className="h-4 w-4" />
            {conversions.length > 0 && (
              <span className="absolute -right-2.5 -top-1 rounded-full bg-accent px-1 font-mono text-[9px] leading-tight text-white">
                {conversions.length}
              </span>
            )}
          </span>
          <span>Word</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-[10px] font-semibold ${
            activeTab === "history" && settingsTab === null
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Riwayat</span>
        </button>
        <button
          type="button"
          onClick={() => setSettingsTab("general")}
          className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-t-2 text-[10px] font-semibold ${
            settingsTab !== null
              ? "border-accent text-accent-soft"
              : "border-transparent text-ink-secondary"
          }`}
        >
          <Settings className="h-4 w-4" />
          <span>Setelan</span>
        </button>
      </nav>

      {/* Floating Literature Matrix Selection Bar */}
      {selectedMatrixList.length > 0 && (
        <div className="animate-panel-open fixed bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-accent/45 bg-surface/95 px-4 py-2 text-xs text-ink shadow-2xl backdrop-blur-md md:bottom-6">
          <span className="font-medium">
            <strong className="font-mono text-accent-soft">
              {selectedMatrixList.length}
            </strong>{" "}
            jurnal dipilih
          </span>
          <button
            type="button"
            disabled={selectedMatrixList.length < 2 || buildingMatrix}
            onClick={() => void handleBuildMatrix()}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {buildingMatrix ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Table2 className="h-3.5 w-3.5" />
            )}
            {buildingMatrix
              ? "Menyusun..."
              : selectedMatrixList.length < 2
                ? "Pilih min. 2"
                : "Buat Matriks Literatur"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedPapersMap({})}
            aria-label="Bersihkan pilihan matriks"
            className="rounded-full p-1 text-ink-secondary hover:bg-elevated hover:text-heading"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* In-App PDF Reader & Universal Auto-Translate + Tanya AI Modal */}
      {readerState && (
        <PdfReaderModal
          key={readerState.paper.paperKey}
          paper={readerState.paper}
          initialTranslate={readerState.autoTranslate}
          initialDesktopView={readerState.desktopView}
          initialMobileTab={readerState.mobileTab}
          onViewChange={handleReaderViewChange}
          onClose={() => setReaderState(null)}
          onDownloadPdf={handleDownloadPdf}
          onDownloadTranslatedDocx={(p) =>
            handleConvertWord(p, "translate_id")
          }
        />
      )}

      {/* Citation Network & Snowballing Modal */}
      {networkState && (
        <CitationNetworkModal
          key={networkState.paper.paperKey}
          initialPaper={networkState.paper}
          initialTrail={networkState.trail}
          initialTab={networkState.activeTab}
          bookmarkedKeys={new Set(bookmarkedMap.keys())}
          onStateChange={handleNetworkStateChange}
          onClose={() => setNetworkState(null)}
          onToggleBookmark={handleToggleBookmark}
          onOpenReader={(p, autoTranslate = false) =>
            setReaderState({ paper: p, autoTranslate })
          }
          onBuildMatrix={async (papers) => {
            await handleBuildMatrix(papers);
          }}
        />
      )}

      {/* AI Literature Matrix Modal */}
      {matrixResult && (
        <LiteratureMatrixModal
          matrix={matrixResult}
          onClose={() => {
            setMatrixResult(null);
            setActiveMatrixKey(null);
          }}
        />
      )}

      {/* Cross-Device Account & Sync Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={(user) => {
            setAuthUser(user);
            setShowAuthModal(false);
            setNotice({
              type: "success",
              message: `Masuk sebagai ${user.name}. Ruang riset Anda tersinkronisasi.`,
            });
            void reloadWorkspaceData();
          }}
        />
      )}

      {/* Unified Settings, Theme, Quota & Account Modal */}
      {settingsTab !== null && (
        <SettingsModal
          user={authUser}
          initialTab={settingsTab}
          quotaStatus={quotaStatus}
          onRefreshQuota={refreshQuota}
          searchPrefs={searchPrefs}
          onSearchPrefsChange={handleSearchPrefsChange}
          onOpenAuth={() => setShowAuthModal(true)}
          onOpenShortcuts={() => setShowShortcutsModal(true)}
          onClearLocalCache={() => {
            clearAllLocalCache();
            setSearchSyncBadge(null);
            setNotice({
              type: "info",
              message:
                "Cache lokal dibersihkan. Pencarian berikutnya akan mengambil data segar.",
            });
          }}
          onClose={() => setSettingsTab(null)}
          onProfileUpdated={(updated) => {
            setAuthUser(updated);
            setNotice({
              type: "success",
              message: `Profil diperbarui (${updated.name}).`,
            });
          }}
          onLogout={handleLogout}
          onLoggedOutAll={() => {
            setSettingsTab(null);
            clearAllLocalCache();
            setAuthUser(null);
            setSelectedProjectId(null);
            setBookmarks([]);
            setProjects([]);
            setHistory([]);
            setConversions([]);
            setNotice({
              type: "info",
              message: "Semua sesi di semua perangkat telah dikeluarkan.",
            });
            void reloadWorkspaceData();
          }}
          onAccountDeleted={() => {
            setSettingsTab(null);
            clearAllLocalCache();
            setAuthUser(null);
            setSelectedProjectId(null);
            setBookmarks([]);
            setProjects([]);
            setHistory([]);
            setConversions([]);
            setSearchResult(null);
            setSearchBrief(null);
            setMatrixResult(null);
            setReaderState(null);
            setNetworkState(null);
            setSelectedPapersMap({});
            setNotice({
              type: "info",
              message: "Akun dan seluruh data Anda telah dihapus permanen.",
            });
            void reloadWorkspaceData();
          }}
        />
      )}

      {/* Keyboard Shortcuts & Tips Modal */}
      {showShortcutsModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcutsModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Pintasan Keyboard & Tips SmartSari"
        >
          <div className="animate-modal-in max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line-strong bg-surface p-6 text-ink shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-accent-soft" />
                <h2 className="text-base font-semibold text-heading">
                  Pintasan &amp; Tips Riset
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                aria-label="Tutup bantuan"
                className="rounded-lg p-1 text-ink-secondary hover:bg-elevated hover:text-heading"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { key: "Ctrl+K / /", desc: "Fokus cepat ke bilah pencarian" },
                { key: "Ctrl+Enter", desc: "Simpan catatan riset di kartu tersimpan" },
                { key: "Esc", desc: "Tutup modal atau panel yang sedang terbuka" },
                { key: "?", desc: "Buka / tutup jendela pintasan ini" },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
                >
                  <span className="text-ink-body">{item.desc}</span>
                  <kbd className="shrink-0 rounded border border-line-strong bg-elevated px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-tint">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs leading-relaxed text-ink-strong">
              <strong className="text-heading">Tips:</strong> Tempel langsung
              nomor <strong>DOI</strong> di pencarian, gunakan tombol{" "}
              <strong>Pilih Top 5</strong> untuk membandingkan jurnal secara
              instan, atau pakai <strong>Jejaring</strong> untuk menelusuri
              referensi dan sitasi.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
