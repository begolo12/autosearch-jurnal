import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchHistory } from "@/db/schema";
import { aggregateJournalSearch } from "@/lib/search/aggregator";
import type { SearchSource, SortOption } from "@/lib/types";

const VALID_SOURCES = new Set<SearchSource>([
  "openalex",
  "arxiv",
  "europepmc",
  "doaj",
]);

export async function GET(request: NextRequest) {
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
    sortRaw === "newest" || sortRaw === "citations" ? sortRaw : "relevance";

  const result = await aggregateJournalSearch({
    query,
    sources: rawSources.length > 0 ? rawSources : undefined,
    pdfOnly,
    yearFrom,
    sort,
  });

  // Log search history best-effort so DB latency/issues never block search
  try {
    const db = getDb();
    await db.insert(searchHistory).values({
      query,
      filters: {
        sources: rawSources.length > 0 ? rawSources : ["openalex", "arxiv", "europepmc", "doaj"],
        pdfOnly,
        yearFrom,
        sort,
      },
      resultCount: result.total,
    });
  } catch (err) {
    console.warn("Failed to log search history:", err);
  }

  return NextResponse.json(result);
}
