import {
  searchEuropePmcQ1,
  searchOpenAlexQ1,
} from "@/lib/search/sources";
import type {
  JournalPaper,
  SearchResponse,
  SearchSource,
  SortOption,
  SourceStat,
} from "@/lib/types";

const ALL_SOURCES: SearchSource[] = ["openalex", "europepmc"];

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mergePapers(existing: JournalPaper, incoming: JournalPaper): JournalPaper {
  const bestMetrics =
    (existing.journalMetrics?.impactFactor ?? 0) >=
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
  pdfOnly?: boolean;
  yearFrom?: number | null;
  sort?: SortOption;
}): Promise<SearchResponse> {
  const query = params.query.trim();
  const activeSources =
    params.sources && params.sources.length > 0 ? params.sources : ALL_SOURCES;

  const settled = await Promise.allSettled(
    activeSources.map(async (source) => {
      const papers =
        source === "openalex"
          ? await searchOpenAlexQ1(query, 45, Boolean(params.pdfOnly))
          : await searchEuropePmcQ1(query, 20);
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

  // Deduplicate by normalized DOI or normalized title
  const dedupedMap = new Map<string, JournalPaper>();
  const titleIndex = new Map<string, string>();

  for (const paper of rawPapers) {
    // Safety guard: strictly Q1 verified only
    if (!paper.journalMetrics || paper.journalMetrics.quartile !== "Q1") {
      continue;
    }

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
  if (sort === "impact") {
    papers.sort(
      (a, b) =>
        (b.journalMetrics?.impactFactor ?? 0) -
        (a.journalMetrics?.impactFactor ?? 0)
    );
  } else if (sort === "newest") {
    papers.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  } else if (sort === "citations") {
    papers.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
  } else {
    papers.sort((a, b) => Number(Boolean(b.pdfUrl)) - Number(Boolean(a.pdfUrl)));
  }

  return {
    query,
    total: papers.length,
    papers,
    sourceStats,
  };
}
