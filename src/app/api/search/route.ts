import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchHistory } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { aggregateJournalSearch } from "@/lib/search/aggregator";
import { attachSessionCookie, getSessionContext } from "@/lib/session";
import type { SearchSource, SortOption } from "@/lib/types";

const VALID_SOURCES = new Set<SearchSource>(["openalex", "europepmc"]);

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

  const rawSources = (searchParams.get("sources") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SearchSource => VALID_SOURCES.has(s as SearchSource));

  const pdfOnly = searchParams.get("pdfOnly") === "true";
  const yearParam = searchParams.get("yearFrom");
  const yearFrom = yearParam ? Number(yearParam) || null : null;
  const sortRaw = searchParams.get("sort");
  const sort: SortOption =
    sortRaw === "impact" || sortRaw === "newest" || sortRaw === "citations"
      ? sortRaw
      : "relevance";

  const result = await aggregateJournalSearch({
    query,
    sources: rawSources.length > 0 ? rawSources : undefined,
    pdfOnly,
    yearFrom,
    sort,
  });

  // Log search history per session (best-effort)
  try {
    const db = getDb();
    await db.insert(searchHistory).values({
      sessionId,
      query,
      filters: {
        sources: rawSources.length > 0 ? rawSources : ["openalex", "europepmc"],
        pdfOnly,
        yearFrom,
        sort,
      },
      resultCount: result.total,
    });
  } catch (err) {
    console.warn("Failed to log search history:", err);
  }

  return attachSessionCookie(NextResponse.json(result), sessionId, isNew);
}
