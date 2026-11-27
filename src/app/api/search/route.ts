import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchCache, searchHistory } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { aggregateJournalSearch } from "@/lib/search/aggregator";
import { attachSessionCookie, getSessionContext } from "@/lib/session";
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
    v: 3,
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
  const { sessionId, isNew } = getSessionContext(request);
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

  const cacheKey = buildSearchCacheKey({
    query,
    sources: activeSources,
    tiers: activeTiers,
    pdfOnly,
    yearFrom,
    sort,
    page,
  });

  const db = getDb();

  // 1. Check shared Neon search_cache for 100% cross-device consistency & speed
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
      if (page === 1) {
        try {
          await db.insert(searchHistory).values({
            sessionId,
            query,
            filters: {
              sources: activeSources,
              tiers: activeTiers,
              pdfOnly,
              yearFrom,
              sort,
            },
            resultCount: payload.total,
          });
        } catch {
          // Non-fatal
        }
      }

      const res = NextResponse.json(payload, {
        headers: { "X-Search-Cache": "HIT" },
      });
      return attachSessionCookie(res, sessionId, isNew);
    }
  } catch (err) {
    console.warn("Search cache read failed:", err);
  }

  // 2. Cache miss: query upstream academic APIs with deterministic sorting
  const result = await aggregateJournalSearch({
    query,
    sources: activeSources,
    tiers: activeTiers,
    pdfOnly,
    yearFrom,
    sort,
    page,
  });

  // 3. Persist to shared search_cache when at least one source succeeded & returned papers
  if (result.total > 0 && result.sourceStats.some((s) => s.ok)) {
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
  }

  // 4. Log per-session search history (best-effort, page 1 only)
  if (page === 1) {
    try {
      await db.insert(searchHistory).values({
        sessionId,
        query,
        filters: {
          sources: activeSources,
          tiers: activeTiers,
          pdfOnly,
          yearFrom,
          sort,
        },
        resultCount: result.total,
      });
    } catch (err) {
      console.warn("Failed to log search history:", err);
    }
  }

  const res = NextResponse.json(result, {
    headers: { "X-Search-Cache": "MISS" },
  });
  return attachSessionCookie(res, sessionId, isNew);
}
