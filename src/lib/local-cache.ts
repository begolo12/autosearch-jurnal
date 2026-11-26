import type {
  AuthUser,
  BookmarkRecord,
  CitationNetworkResponse,
  ConversionRecord,
  JournalPaper,
  LiteratureMatrixResult,
  PaperChatMessage,
  PaperTakeaways,
  ResearchProjectRecord,
  SearchHistoryRecord,
  SearchResearchBrief,
  SearchResponse,
  SearchSource,
  SortOption,
} from "@/lib/types";

const PREFIX = "smartsari:v1:";
const DAY_MS = 24 * 60 * 60 * 1000;

interface CacheItem<T> {
  value: T;
  savedAt: number;
  expiresAt: number;
}

type BucketMap<T> = Record<string, CacheItem<T>>;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readBucket<T>(bucket: string): BucketMap<T> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${bucket}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BucketMap<T>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBucket<T>(
  bucket: string,
  map: BucketMap<T>,
  maxItems: number
): void {
  if (!isBrowser()) return;
  const now = Date.now();
  const entries = Object.entries(map)
    .filter(([, v]) => v && typeof v.expiresAt === "number" && v.expiresAt > now)
    .sort((a, b) => b[1].savedAt - a[1].savedAt)
    .slice(0, maxItems);

  const trimmed = Object.fromEntries(entries);
  const storageKey = `${PREFIX}${bucket}`;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(trimmed));
  } catch {
    // QuotaExceededError recovery: trim bucket in half and retry
    try {
      const half = Object.fromEntries(entries.slice(0, Math.max(1, Math.floor(entries.length / 2))));
      window.localStorage.setItem(storageKey, JSON.stringify(half));
    } catch {
      // If still full, clear oldest full-translation cache first
      try {
        window.localStorage.removeItem(`${PREFIX}full_translations`);
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(Object.fromEntries(entries.slice(0, 3)))
        );
      } catch {
        // Ignore if storage is disabled
      }
    }
  }
}

export function readCacheEntry<T>(
  bucket: string,
  key: string
): { value: T; savedAt: number } | null {
  const map = readBucket<T>(bucket);
  const item = map[key];
  if (!item || item.expiresAt <= Date.now()) return null;
  return { value: item.value, savedAt: item.savedAt };
}

export function writeCacheEntry<T>(
  bucket: string,
  key: string,
  value: T,
  maxItems: number,
  ttlMs: number
): void {
  const map = readBucket<T>(bucket);
  const now = Date.now();
  map[key] = {
    value,
    savedAt: now,
    expiresAt: now + ttlMs,
  };
  writeBucket(bucket, map, maxItems);
}

// 1. Search Results (7 days, max 40 queries)
export function getCachedSearch(
  key: string
): { data: SearchResponse; savedAt: number } | null {
  const hit = readCacheEntry<SearchResponse>("searches", key);
  return hit ? { data: hit.value, savedAt: hit.savedAt } : null;
}

export function setCachedSearch(key: string, data: SearchResponse): void {
  writeCacheEntry("searches", key, data, 40, 7 * DAY_MS);
}

// 2. Abstract Translations (30 days, max 120 papers)
export function getCachedAbstractTranslation(
  paperKey: string
): { title: string; abstract: string } | null {
  return (
    readCacheEntry<{ title: string; abstract: string }>(
      "abstract_translations",
      paperKey
    )?.value ?? null
  );
}

export function setCachedAbstractTranslation(
  paperKey: string,
  val: { title: string; abstract: string }
): void {
  writeCacheEntry("abstract_translations", paperKey, val, 120, 30 * DAY_MS);
}

// 3. Full Paper Translations (30 days, max 25 papers)
export function getCachedFullTranslation(
  paperKey: string
): { markdown: string; model: string } | null {
  return (
    readCacheEntry<{ markdown: string; model: string }>(
      "full_translations",
      paperKey
    )?.value ?? null
  );
}

export function setCachedFullTranslation(
  paperKey: string,
  val: { markdown: string; model: string }
): void {
  writeCacheEntry("full_translations", paperKey, val, 25, 30 * DAY_MS);
}

// 4. AI Paper Takeaways (30 days, max 100 papers)
export function getCachedTakeaways(paperKey: string): PaperTakeaways | null {
  return readCacheEntry<PaperTakeaways>("takeaways", paperKey)?.value ?? null;
}

export function setCachedTakeaways(
  paperKey: string,
  val: PaperTakeaways
): void {
  writeCacheEntry("takeaways", paperKey, val, 100, 30 * DAY_MS);
}

// 5. AI Search Research Brief (14 days, max 30 queries)
export function getCachedBrief(key: string): SearchResearchBrief | null {
  return readCacheEntry<SearchResearchBrief>("briefs", key)?.value ?? null;
}

export function setCachedBrief(key: string, val: SearchResearchBrief): void {
  writeCacheEntry("briefs", key, val, 30, 14 * DAY_MS);
}

// 6. AI Literature Matrix (30 days, max 20 matrices)
export function getCachedMatrix(key: string): LiteratureMatrixResult | null {
  return readCacheEntry<LiteratureMatrixResult>("matrices", key)?.value ?? null;
}

export function setCachedMatrix(
  key: string,
  val: LiteratureMatrixResult
): void {
  writeCacheEntry("matrices", key, val, 20, 30 * DAY_MS);
}

// 7. Paper AI Chat History (30 days, max 30 papers)
export function getCachedPaperChat(
  paperKey: string
): { messages: PaperChatMessage[]; usedFullText: boolean | null } | null {
  return (
    readCacheEntry<{
      messages: PaperChatMessage[];
      usedFullText: boolean | null;
    }>("paper_chats", paperKey)?.value ?? null
  );
}

export function setCachedPaperChat(
  paperKey: string,
  val: { messages: PaperChatMessage[]; usedFullText: boolean | null }
): void {
  writeCacheEntry("paper_chats", paperKey, val, 30, 30 * DAY_MS);
}

// 8. Citation Network (14 days, max 30 seeds)
export function getCachedNetwork(
  key: string
): CitationNetworkResponse | null {
  return (
    readCacheEntry<CitationNetworkResponse>("networks", key)?.value ?? null
  );
}

export function setCachedNetwork(
  key: string,
  val: CitationNetworkResponse
): void {
  writeCacheEntry("networks", key, val, 30, 14 * DAY_MS);
}

// 9. Workspace Snapshot (0ms sidebar hydration)
export interface WorkspaceSnapshot {
  authUser: AuthUser | null;
  projects: ResearchProjectRecord[];
  bookmarks: BookmarkRecord[];
  history: SearchHistoryRecord[];
  conversions: ConversionRecord[];
}

export function getWorkspaceSnapshot(): WorkspaceSnapshot | null {
  return (
    readCacheEntry<WorkspaceSnapshot>("workspace", "snapshot")?.value ?? null
  );
}

export function setWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  writeCacheEntry("workspace", "snapshot", snapshot, 2, 30 * DAY_MS);
}

// 10. Active UI Session (restores active tab, search results, modals, scroll across refresh)
export interface UiReaderSession {
  paper: JournalPaper;
  autoTranslate: boolean;
  desktopView?: "split" | "pdf" | "translate" | "chat";
  mobileTab?: "pdf" | "translate" | "chat";
}

export interface UiNetworkSession {
  paper: JournalPaper;
  trail: JournalPaper[];
  activeTab: "citing" | "references" | "related";
}

export interface UiSessionState {
  activeTab: "search" | "bookmarks" | "conversions" | "history";
  sidebarOpen: boolean;
  selectedProjectId: string | null;
  query: string;
  selectedSources: SearchSource[];
  tierPreset: "all" | "q1" | "q1_q2" | "q1_q4" | "sinta";
  pdfOnly: boolean;
  yearFrom: string;
  sort: SortOption;
  activeSearchCacheKey: string | null;
  activeBriefCacheKey: string | null;
  activeMatrixKey: string | null;
  selectedPapersMap: Record<string, JournalPaper>;
  readerState: UiReaderSession | null;
  networkState: UiNetworkSession | null;
  scrollY?: number;
}

export function getUiSession(): UiSessionState | null {
  return readCacheEntry<UiSessionState>("ui_session", "active")?.value ?? null;
}

export function setUiSession(state: UiSessionState): void {
  writeCacheEntry("ui_session", "active", state, 2, 7 * DAY_MS);
}

export function patchUiSessionScroll(scrollY: number): void {
  const existing = getUiSession();
  if (!existing) return;
  writeCacheEntry(
    "ui_session",
    "active",
    { ...existing, scrollY },
    2,
    7 * DAY_MS
  );
}

export function clearAllLocalCache(): number {
  if (!isBrowser()) return 0;
  let cleared = 0;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
      cleared += 1;
    }
  } catch {
    // Ignore storage errors
  }
  return cleared;
}
