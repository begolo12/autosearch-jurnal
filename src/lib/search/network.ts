import {
  classifyJournalMetrics,
  cleanDoi,
  fetchOpenAlexSourcesByIds,
  makePaperKey,
  reconstructOpenAlexAbstract,
  type OpenAlexSourceMeta,
  type OpenAlexWork,
} from "@/lib/search/sources";
import {
  TIER_PRIORITY_ORDER,
  type CitationNetworkResponse,
  type JournalPaper,
} from "@/lib/types";

const OA_HEADERS = {
  "User-Agent": "SmartSari/2.0 (mailto:hello@smartsari.my.id)",
  Accept: "application/json",
};

function shortOaId(raw: string): string {
  return raw.replace("https://openalex.org/", "").trim();
}

async function resolveSeedWork(
  title: string,
  doi?: string | null
): Promise<OpenAlexWork | null> {
  const cleanedDoi = cleanDoi(doi);
  if (cleanedDoi) {
    try {
      const res = await fetch(
        `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(
          cleanedDoi
        )}`,
        { headers: OA_HEADERS, signal: AbortSignal.timeout(9000) }
      );
      if (res.ok) {
        return (await res.json()) as OpenAlexWork;
      }
    } catch {
      // Fall back to title search
    }
  }

  try {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", title);
    url.searchParams.set("per-page", "1");
    url.searchParams.set("mailto", "hello@smartsari.my.id");
    const res = await fetch(url.toString(), {
      headers: OA_HEADERS,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: OpenAlexWork[] };
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchWorksByFilter(
  filter: string,
  limit = 15
): Promise<OpenAlexWork[]> {
  try {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("filter", filter);
    url.searchParams.set("sort", "cited_by_count:desc");
    url.searchParams.set("per-page", String(limit));
    url.searchParams.set("mailto", "hello@smartsari.my.id");
    const res = await fetch(url.toString(), {
      headers: OA_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OpenAlexWork[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}

function mapWorksToPapers(
  works: OpenAlexWork[],
  sourceMap: Map<string, OpenAlexSourceMeta>
): JournalPaper[] {
  const papers: JournalPaper[] = [];

  for (const item of works) {
    if (!item.title) continue;

    const rawSourceId = shortOaId(
      item.primary_location?.source?.id ||
        item.best_oa_location?.source?.id ||
        ""
    );
    const sourceMeta = rawSourceId ? sourceMap.get(rawSourceId) : undefined;
    const metrics = sourceMeta
      ? classifyJournalMetrics(sourceMeta, TIER_PRIORITY_ORDER) ?? undefined
      : undefined;

    const title = item.title.trim();
    const doi = cleanDoi(item.doi);
    const pdfUrl =
      item.best_oa_location?.pdf_url ||
      item.primary_location?.pdf_url ||
      (item.open_access?.oa_url?.toLowerCase().includes(".pdf")
        ? item.open_access.oa_url
        : null) ||
      null;
    const landingUrl =
      item.best_oa_location?.landing_page_url ||
      item.primary_location?.landing_page_url ||
      item.open_access?.oa_url ||
      (doi ? `https://doi.org/${doi}` : item.id || null);

    const authors = (item.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 8);

    const venue =
      sourceMeta?.display_name ||
      item.primary_location?.source?.display_name ||
      item.best_oa_location?.source?.display_name ||
      null;

    papers.push({
      paperKey: makePaperKey("openalex", doi, title, item.id),
      title,
      authors,
      year: item.publication_year ?? null,
      venue,
      source: "openalex",
      abstract: reconstructOpenAlexAbstract(item.abstract_inverted_index),
      pdfUrl,
      landingUrl,
      doi,
      citations: item.cited_by_count ?? null,
      openAccess: Boolean(item.open_access?.is_oa || pdfUrl),
      language: item.language?.toUpperCase() || null,
      journalMetrics: metrics,
    });
  }

  // Prioritize Q1-Q4 & SINTA 1-6 first, then sort by citations descending
  papers.sort((a, b) => {
    const tierA = a.journalMetrics?.primaryTier
      ? TIER_PRIORITY_ORDER.indexOf(a.journalMetrics.primaryTier)
      : 999;
    const tierB = b.journalMetrics?.primaryTier
      ? TIER_PRIORITY_ORDER.indexOf(b.journalMetrics.primaryTier)
      : 999;
    if (tierA !== tierB) return tierA - tierB;
    return (b.citations ?? 0) - (a.citations ?? 0);
  });

  return papers;
}

export async function fetchCitationNetwork(params: {
  title: string;
  doi?: string | null;
}): Promise<CitationNetworkResponse> {
  const seed = await resolveSeedWork(params.title, params.doi);
  if (!seed?.id) {
    return {
      seedTitle: params.title,
      seedOpenAlexId: null,
      citedByCount: null,
      citing: [],
      references: [],
      related: [],
    };
  }

  const seedShortId = shortOaId(seed.id);
  const refIds = (seed.referenced_works ?? []).map(shortOaId).filter(Boolean).slice(0, 15);
  const relIds = (seed.related_works ?? []).map(shortOaId).filter(Boolean).slice(0, 15);

  const [citingWorks, refWorks, relWorks] = await Promise.all([
    fetchWorksByFilter(`cites:${seedShortId}`, 15),
    refIds.length > 0
      ? fetchWorksByFilter(`openalex:${refIds.join("|")}`, 15)
      : Promise.resolve([]),
    relIds.length > 0
      ? fetchWorksByFilter(`openalex:${relIds.join("|")}`, 15)
      : Promise.resolve([]),
  ]);

  const allSourceIds = [...citingWorks, ...refWorks, ...relWorks]
    .map((w) =>
      shortOaId(
        w.primary_location?.source?.id || w.best_oa_location?.source?.id || ""
      )
    )
    .filter(Boolean);

  const sourceMap = await fetchOpenAlexSourcesByIds(allSourceIds);

  return {
    seedTitle: seed.title?.trim() || params.title,
    seedOpenAlexId: seedShortId,
    citedByCount: seed.cited_by_count ?? null,
    citing: mapWorksToPapers(citingWorks, sourceMap),
    references: mapWorksToPapers(refWorks, sourceMap),
    related: mapWorksToPapers(relWorks, sourceMap),
  };
}
