import {
  searchEuropePmcByTiers,
  searchOpenAlexByTiers,
} from "@/lib/search/sources";
import {
  TIER_PRIORITY_ORDER,
  type JournalPaper,
  type JournalTier,
  type SearchResponse,
  type SearchSource,
  type SortOption,
  type SourceStat,
} from "@/lib/types";

const ALL_SOURCES: SearchSource[] = ["openalex", "europepmc"];

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function computeTitleRelevance(title: string, query: string): number {
  const normTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const normQuery = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
  if (!normQuery) return 0;

  let score = normTitle.includes(normQuery) ? 1.0 : 0;
  const tokens = Array.from(
    new Set(normQuery.split(/\s+/).filter((t) => t.length >= 2))
  );
  if (tokens.length === 0) return score;

  const matched = tokens.filter((t) => normTitle.includes(t)).length;
  score += matched / tokens.length;
  return score;
}

function tierRank(tier?: JournalTier): number {
  if (!tier) return 999;
  const idx = TIER_PRIORITY_ORDER.indexOf(tier);
  return idx === -1 ? 999 : idx;
}

function mergePapers(existing: JournalPaper, incoming: JournalPaper): JournalPaper {
  const existingRank = tierRank(existing.journalMetrics?.primaryTier);
  const incomingRank = tierRank(incoming.journalMetrics?.primaryTier);
  const bestMetrics =
    existingRank < incomingRank
      ? existing.journalMetrics
      : incomingRank < existingRank
        ? incoming.journalMetrics
        : (existing.journalMetrics?.impactFactor ?? 0) >=
            (incoming.journalMetrics?.impactFactor ?? 0)
          ? existing.journalMetrics
          : incoming.journalMetrics;

  return {
    ...existing,
    pdfUrl: existing.pdfUrl || incoming.pdfUrl,
    landingUrl: existing.landingUrl || incoming.landingUrl,
    doi: existing.doi || incoming.doi,
    venue: existing.venue || incoming.venue,
    year: existing.year ?? incoming.year,
    language: existing.language || incoming.language,
    journalMetrics: bestMetrics,
    authors:
      existing.authors.length >= incoming.authors.length
        ? existing.authors
        : incoming.authors,
    abstract:
      (existing.abstract?.length ?? 0) >= (incoming.abstract?.length ?? 0)
        ? existing.abstract
        : incoming.abstract,
    citations:
      Math.max(existing.citations ?? -1, incoming.citations ?? -1) >= 0
        ? Math.max(existing.citations ?? 0, incoming.citations ?? 0)
        : null,
    openAccess: existing.openAccess || incoming.openAccess,
  };
}

export async function aggregateJournalSearch(params: {
  query: string;
  sources?: SearchSource[];
  tiers?: JournalTier[];
  pdfOnly?: boolean;
  yearFrom?: number | null;
  sort?: SortOption;
}): Promise<SearchResponse> {
  const query = params.query.trim();
  const activeSources =
    params.sources && params.sources.length > 0 ? params.sources : ALL_SOURCES;
  const activeTiers: JournalTier[] =
    params.tiers && params.tiers.length > 0
      ? params.tiers
      : [...TIER_PRIORITY_ORDER];

  const settled = await Promise.allSettled(
    activeSources.map(async (source) => {
      const papers =
        source === "openalex"
          ? await searchOpenAlexByTiers(
              query,
              activeTiers,
              45,
              Boolean(params.pdfOnly)
            )
          : await searchEuropePmcByTiers(query, activeTiers, 20);
      return { source, papers };
    })
  );

  const sourceStats: SourceStat[] = [];
  const rawPapers: JournalPaper[] = [];

  settled.forEach((result, idx) => {
    const source = activeSources[idx];
    if (result.status === "fulfilled") {
      sourceStats.push({
        source,
        count: result.value.papers.length,
        ok: true,
      });
      rawPapers.push(...result.value.papers);
    } else {
      sourceStats.push({
        source,
        count: 0,
        ok: false,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : "Gagal menghubungi sumber",
      });
    }
  });

  const dedupedMap = new Map<string, JournalPaper>();
  const titleIndex = new Map<string, string>();

  for (const paper of rawPapers) {
    if (!paper.journalMetrics) continue;

    const doiKey = paper.doi ? `doi:${paper.doi.toLowerCase()}` : null;
    const titleKey = `t:${normalizeTitle(paper.title)}`;

    const existingKey =
      (doiKey && dedupedMap.has(doiKey) ? doiKey : null) ||
      titleIndex.get(titleKey) ||
      null;

    if (existingKey && dedupedMap.has(existingKey)) {
      const merged = mergePapers(dedupedMap.get(existingKey)!, paper);
      dedupedMap.set(existingKey, merged);
    } else {
      const key = doiKey || titleKey || paper.paperKey;
      dedupedMap.set(key, paper);
      titleIndex.set(titleKey, key);
    }
  }

  let papers = Array.from(dedupedMap.values());

  if (params.pdfOnly) {
    papers = papers.filter((p) => Boolean(p.pdfUrl));
  }

  if (params.yearFrom) {
    papers = papers.filter((p) => (p.year ?? 0) >= params.yearFrom!);
  }

  const sort = params.sort ?? "relevance";
  // Primary sort: ALWAYS prioritize Q1 first, followed by Q2, Q3, Q4, SINTA1..SINTA6
  // Secondary sort is 100% deterministic with paperKey tie-breaker
  papers.sort((a, b) => {
    const rankDiff =
      tierRank(a.journalMetrics?.primaryTier) -
      tierRank(b.journalMetrics?.primaryTier);
    if (rankDiff !== 0) return rankDiff;

    const relA = computeTitleRelevance(a.title, query);
    const relB = computeTitleRelevance(b.title, query);
    const ifA = a.journalMetrics?.impactFactor ?? 0;
    const ifB = b.journalMetrics?.impactFactor ?? 0;
    const citA = a.citations ?? -1;
    const citB = b.citations ?? -1;
    const yrA = a.year ?? 0;
    const yrB = b.year ?? 0;

    if (sort === "impact") {
      if (ifB !== ifA) return ifB - ifA;
      if (relB !== relA) return relB - relA;
      if (citB !== citA) return citB - citA;
      return a.paperKey.localeCompare(b.paperKey);
    }
    if (sort === "newest") {
      if (yrB !== yrA) return yrB - yrA;
      if (relB !== relA) return relB - relA;
      if (ifB !== ifA) return ifB - ifA;
      return a.paperKey.localeCompare(b.paperKey);
    }
    if (sort === "citations") {
      if (citB !== citA) return citB - citA;
      if (ifB !== ifA) return ifB - ifA;
      return a.paperKey.localeCompare(b.paperKey);
    }

    const scoreA = (a.pdfUrl ? 2 : 0) + relA * 3;
    const scoreB = (b.pdfUrl ? 2 : 0) + relB * 3;
    if (Math.abs(scoreB - scoreA) > 0.001) return scoreB - scoreA;
    if (ifB !== ifA) return ifB - ifA;
    if (citB !== citA) return citB - citA;
    if (yrB !== yrA) return yrB - yrA;
    return a.paperKey.localeCompare(b.paperKey);
  });

  return {
    query,
    total: papers.length,
    papers,
    sourceStats,
  };
}
