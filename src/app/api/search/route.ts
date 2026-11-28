import crypto from "crypto";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { after, NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchCache, searchHistory } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { aggregateJournalSearch } from "@/lib/search/aggregator";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";
import {
  TIER_PRIORITY_ORDER,
  type JournalTier,
  type SearchResponse,
  type SearchSource,
  type SortOption,
} from "@/lib/types";

const VALID_SOURCES = new Set<SearchSource>(["openalex", "europepmc", "crossref"]);
const VALID_TIERS = new Set<JournalTier>(TIER_PRIORITY_ORDER);
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const HOT_CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const HOT_CACHE_MAX = 200;

const hotSearchCache = new Map<
  string,
  { payload: SearchResponse; expiresAt: number }
>();

function getHotSearch(key: string): SearchResponse | null {
  const hit = hotSearchCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    hotSearchCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setHotSearch(key: string, payload: SearchResponse) {
  if (hotSearchCache.size >= HOT_CACHE_MAX) {
    const oldest = hotSearchCache.keys().next().value;
    if (oldest) hotSearchCache.delete(oldest);
  }
  hotSearchCache.set(key, {
    payload,
    expiresAt: Date.now() + HOT_CACHE_TTL_MS,
  });
}

function scheduleHistoryLog(params: {
  sessionId: string;
  query: string;
  filters: {
    sources: SearchSource[];
    tiers: JournalTier[];
    pdfOnly: boolean;
    yearFrom: number | null;
    sort: SortOption;
  };
  resultCount: number;
}) {
  after(async () => {
    try {
      const db = getDb();
      await db.insert(searchHistory).values({
        sessionId: params.sessionId,
        query: params.query,
        filters: params.filters,
        resultCount: params.resultCount,
      });

      if (Math.random() < 0.1) {
        const overflow = await db
          .select({ id: searchHistory.id })
          .from(searchHistory)
          .where(eq(searchHistory.sessionId, params.sessionId))
          .orderBy(desc(searchHistory.createdAt))
          .offset(100);
        if (overflow.length > 0) {
          await db
            .delete(searchHistory)
            .where(inArray(searchHistory.id, overflow.map((r) => r.id)));
        }
      }
    } catch (err) {
      console.warn("Failed to log search history:", err);
    }
  });
}

function buildSearchCacheKey(params: {
  query: string;
  sources: SearchSource[];
  tiers: JournalTier[];
  pdfOnly: boolean;
  yearFrom: number | null;
  sort: SortOption;
  page: number;
}): string {
  const canonical = JSON.stringify({
    v: 4,
    q: params.query.toLowerCase().replace(/\s+/g, " ").trim(),
    sources: [...params.sources].sort(),
    tiers: [...params.tiers].sort(),
    pdfOnly: params.pdfOnly,
    yearFrom: params.yearFrom,
    sort: params.sort,
    page: params.page,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const { sessionId, isNew, clearStaleAuth } =
    await resolveSessionContext(request);
  const rl = await checkRateLimit(request, "search", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak pencarian. Silakan tunggu ${rl.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  const { searchParams } = request.nextUrl;
  const query = (searchParams.get("q") || "").trim();

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Masukkan kata kunci pencarian minimal 2 karakter." },
      { status: 400 }
    );
  }

  if (query.length > 200) {
    return NextResponse.json(
      { error: "Kata kunci pencarian maksimal 200 karakter." },
      { status: 400 }
    );
  }

  const rawSources = (searchParams.get("sources") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SearchSource => VALID_SOURCES.has(s as SearchSource));

  const activeSources: SearchSource[] =
    rawSources.length > 0
      ? rawSources
      : ["openalex", "europepmc", "crossref"];

  const rawTiers = (searchParams.get("tiers") || "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is JournalTier => VALID_TIERS.has(t as JournalTier));

  const activeTiers: JournalTier[] =
    rawTiers.length > 0 ? rawTiers : [...TIER_PRIORITY_ORDER];

  const pdfOnly = searchParams.get("pdfOnly") === "true";
  const yearParam = searchParams.get("yearFrom");
  const parsedYear = yearParam ? Number(yearParam) : NaN;
  const maxYear = new Date().getFullYear() + 1;
  const yearFrom =
    Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= maxYear
      ? parsedYear
      : null;
  const sortRaw = searchParams.get("sort");
  const sort: SortOption =
    sortRaw === "impact" || sortRaw === "newest" || sortRaw === "citations"
      ? sortRaw
      : "relevance";
  const page = Math.min(5, Math.max(1, Number(searchParams.get("page")) || 1));

  const filtersSummary = {
    sources: activeSources,
    tiers: activeTiers,
    pdfOnly,
    yearFrom,
    sort,
  };

  const cacheKey = buildSearchCacheKey({
    query,
    sources: activeSources,
    tiers: activeTiers,
    pdfOnly,
    yearFrom,
    sort,
    page,
  });

  // 1. Hot in-memory cache check (0ms latency)
  const memPayload = getHotSearch(cacheKey);
  if (memPayload) {
    if (page === 1) {
      scheduleHistoryLog({
        sessionId,
        query,
        filters: filtersSummary,
        resultCount: memPayload.total,
      });
    }
    const res = NextResponse.json(memPayload, {
      headers: {
        "X-Search-Cache": "MEM-HIT",
        "X-Search-Time-Ms": String(Date.now() - startedAt),
        "Cache-Control": "no-store",
      },
    });
    return attachSessionCookie(res, sessionId, isNew, clearStaleAuth);
  }

  const db = getDb();

  // 2. Shared Neon search_cache check
  try {
    const cached = await db
      .select()
      .from(searchCache)
      .where(
        and(
          eq(searchCache.cacheKey, cacheKey),
          gt(searchCache.expiresAt, new Date())
        )
      )
      .limit(1);

    if (cached.length > 0) {
      const payload = cached[0].payload as SearchResponse;
      setHotSearch(cacheKey, payload);
      if (page === 1) {
        scheduleHistoryLog({
          sessionId,
          query,
          filters: filtersSummary,
          resultCount: payload.total,
        });
      }

      const res = NextResponse.json(payload, {
        headers: {
          "X-Search-Cache": "DB-HIT",
          "X-Search-Time-Ms": String(Date.now() - startedAt),
          "Cache-Control": "no-store",
        },
      });
      return attachSessionCookie(res, sessionId, isNew, clearStaleAuth);
    }
  } catch (err) {
    console.warn("Search cache read failed:", err);
  }

  // 3. Cache miss: query upstream academic APIs with deterministic sorting
  const result = await aggregateJournalSearch({
    query,
    sources: activeSources,
    tiers: activeTiers,
    pdfOnly,
    yearFrom,
    sort,
    page,
  });

  if (result.total > 0 && result.sourceStats.some((s) => s.ok)) {
    setHotSearch(cacheKey, result);
    after(async () => {
      try {
        const expiresAt = new Date(Date.now() + SEARCH_CACHE_TTL_MS);
        await db
          .insert(searchCache)
          .values({
            cacheKey,
            payload: result,
            expiresAt,
          })
          .onConflictDoUpdate({
            target: searchCache.cacheKey,
            set: {
              payload: result,
              createdAt: new Date(),
              expiresAt,
            },
          });
      } catch (err) {
        console.warn("Search cache write failed:", err);
      }
    });
  }

  if (page === 1) {
    scheduleHistoryLog({
      sessionId,
      query,
      filters: filtersSummary,
      resultCount: result.total,
    });
  }

  const res = NextResponse.json(result, {
    headers: {
      "X-Search-Cache": "MISS",
      "X-Search-Time-Ms": String(Date.now() - startedAt),
      "Cache-Control": "no-store",
    },
  });
  return attachSessionCookie(res, sessionId, isNew, clearStaleAuth);
}
