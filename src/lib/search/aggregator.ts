import {
  searchArxiv,
  searchDoaj,
  searchEuropePmc,
  searchOpenAlex,
} from "@/lib/search/sources";
import type {
  JournalPaper,
  SearchResponse,
  SearchSource,
  SortOption,
  SourceStat,
} from "@/lib/types";

const ALL_SOURCES: SearchSource[] = ["openalex", "arxiv", "europepmc", "doaj"];

const SOURCE_FETCHERS: Record<
  SearchSource,
  (query: string, limit?: number) => Promise<JournalPaper[]>
> = {
  openalex: searchOpenAlex,
  arxiv: searchArxiv,
  europepmc: searchEuropePmc,
  doaj: searchDoaj,
};

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mergePapers(existing: JournalPaper, incoming: JournalPaper): JournalPaper {
  return {
    ...existing,
    pdfUrl: existing.pdfUrl || incoming.pdfUrl,
    landingUrl: existing.landingUrl || incoming.landingUrl,
    doi: existing.doi || incoming.doi,
    venue: existing.venue || incoming.venue,
    year: existing.year ?? incoming.year,
    authors:
      existing.authors.length >= incoming.authors.length
        ? existing.authors
        : incoming.authors,
    abstract:
      (existing.abstract?.length ?? 0) >= (incoming.abstract?.length ?? 0)
        ? existing.abstract
        : incoming.abstract,
    citations: Math.max(existing.citations ?? -1, incoming.citations ?? -1) >= 0
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
      const papers = await SOURCE_FETCHERS[source](query, 14);
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
  if (sort === "newest") {
    papers.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  } else if (sort === "citations") {
    papers.sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1));
  } else {
    // Relevance: prioritize papers with direct PDF available while keeping source order
    papers.sort((a, b) => Number(Boolean(b.pdfUrl)) - Number(Boolean(a.pdfUrl)));
  }

  return {
    query,
    total: papers.length,
    papers,
    sourceStats,
  };
}
