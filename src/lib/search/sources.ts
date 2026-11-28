import { lookupOfficialSintaTier } from "@/lib/search/sinta-registry";
import type {
  JournalMetrics,
  JournalPaper,
  JournalTier,
  QuartileTier,
  SintaTier,
} from "@/lib/types";

const REQUEST_HEADERS = {
  "User-Agent": "SmartSari/2.0 (mailto:hello@smartsari.my.id)",
  Accept: "application/json",
};

const PREPRINT_BLOCKLIST = [
  "arxiv",
  "biorxiv",
  "medrxiv",
  "ssrn",
  "zenodo",
  "research square",
  "preprints",
  "osf preprints",
  "chemrxiv",
];

export interface OpenAlexSourceMeta {
  id?: string;
  display_name?: string;
  issn_l?: string;
  issn?: string[];
  type?: string;
  country_code?: string;
  summary_stats?: {
    "2yr_mean_citedness"?: number;
    h_index?: number;
  };
}

export interface OpenAlexWork {
  id?: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  language?: string;
  referenced_works?: string[];
  related_works?: string[];
  abstract_inverted_index?: Record<string, number[]>;
  open_access?: {
    is_oa?: boolean;
    oa_url?: string;
  };
  best_oa_location?: {
    pdf_url?: string;
    landing_page_url?: string;
    source?: { id?: string; display_name?: string };
  };
  primary_location?: {
    pdf_url?: string;
    landing_page_url?: string;
    source?: { id?: string; display_name?: string };
  };
  authorships?: Array<{
    author?: { display_name?: string };
  }>;
}

export function cleanDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return trimmed.length > 0 ? trimmed : null;
}

export function makePaperKey(
  source: string,
  doi: string | null,
  title: string,
  fallbackId?: string
): string {
  if (doi) return `doi:${doi.toLowerCase()}`;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  if (slug.length >= 6) return `title:${slug}`;
  return `${source}:${fallbackId || Date.now()}`;
}

export function reconstructOpenAlexAbstract(
  invertedIndex: Record<string, number[]> | null | undefined
): string | null {
  if (!invertedIndex || typeof invertedIndex !== "object") return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text.length > 0 ? text : null;
}

function formatTierLabel(tier: JournalTier): string {
  if (tier.startsWith("SINTA")) {
    return `SINTA ${tier.slice(5)}`;
  }
  return tier;
}

export function classifyJournalMetrics(
  src: OpenAlexSourceMeta,
  selectedTiers: JournalTier[]
): JournalMetrics | null {
  if (src.type !== "journal") return null;
  const nameLower = (src.display_name || "").toLowerCase();
  if (PREPRINT_BLOCKLIST.some((blocked) => nameLower.includes(blocked))) {
    return null;
  }

  const c2y = src.summary_stats?.["2yr_mean_citedness"] ?? 0;
  const hIndex = src.summary_stats?.h_index ?? 0;

  let quartile: QuartileTier;
  if ((c2y >= 3.5 && hIndex >= 50) || c2y >= 5.0) {
    quartile = "Q1";
  } else if ((c2y >= 1.8 && hIndex >= 25) || c2y >= 2.5) {
    quartile = "Q2";
  } else if ((c2y >= 0.8 && hIndex >= 10) || c2y >= 1.1) {
    quartile = "Q3";
  } else {
    quartile = "Q4";
  }

  let sinta: SintaTier | undefined;
  let sintaVerified = false;
  const officialSinta = lookupOfficialSintaTier([
    src.issn_l,
    ...(src.issn ?? []),
  ]);

  if (officialSinta) {
    sinta = officialSinta.tier;
    sintaVerified = true;
  } else if (src.country_code === "ID") {
    if (c2y >= 2.0 || hIndex >= 30) {
      sinta = "SINTA1";
    } else if (c2y >= 1.0 || hIndex >= 18) {
      sinta = "SINTA2";
    } else if (c2y >= 0.45 || hIndex >= 10) {
      sinta = "SINTA3";
    } else if (c2y >= 0.2 || hIndex >= 5) {
      sinta = "SINTA4";
    } else if (c2y >= 0.05 || hIndex >= 2) {
      sinta = "SINTA5";
    } else {
      sinta = "SINTA6";
    }
  }

  const tierSet = new Set(selectedTiers);
  // Q1 always takes highest priority if selected
  let primaryTier: JournalTier | null = null;
  if (quartile === "Q1" && tierSet.has("Q1")) {
    primaryTier = "Q1";
  } else if (tierSet.has(quartile)) {
    primaryTier = quartile;
  } else if (sinta && tierSet.has(sinta)) {
    primaryTier = sinta;
  }

  if (!primaryTier) return null;

  return {
    quartile,
    sinta,
    sintaVerified: sinta ? sintaVerified : undefined,
    primaryTier,
    tierLabel: formatTierLabel(primaryTier),
    impactFactor: Number(c2y.toFixed(2)),
    hIndex,
    issn: src.issn_l ?? src.issn?.[0] ?? null,
    countryCode: src.country_code ?? null,
  };
}

export async function fetchOpenAlexSourcesByIds(
  ids: string[]
): Promise<Map<string, OpenAlexSourceMeta>> {
  const map = new Map<string, OpenAlexSourceMeta>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) {
    chunks.push(unique.slice(i, i + 50));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const url = new URL("https://api.openalex.org/sources");
      url.searchParams.set("filter", `openalex:${chunk.join("|")}`);
      url.searchParams.set("per-page", "50");
      url.searchParams.set(
        "select",
        "id,display_name,issn_l,issn,type,country_code,summary_stats"
      );
      url.searchParams.set("mailto", "hello@smartsari.my.id");

      const res = await fetch(url.toString(), {
        headers: REQUEST_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;

      const data = (await res.json()) as { results?: OpenAlexSourceMeta[] };
      for (const s of data.results ?? []) {
        if (s.id) {
          const shortId = s.id.replace("https://openalex.org/", "");
          map.set(shortId, s);
          map.set(s.id, s);
        }
      }
    })
  );

  return map;
}

async function fetchOpenAlexSourcesByIssns(
  issns: string[]
): Promise<Map<string, OpenAlexSourceMeta>> {
  const map = new Map<string, OpenAlexSourceMeta>();
  const unique = Array.from(new Set(issns)).slice(0, 50);
  if (unique.length === 0) return map;

  const url = new URL("https://api.openalex.org/sources");
  url.searchParams.set("filter", `issn:${unique.join("|")}`);
  url.searchParams.set("per-page", "50");
  url.searchParams.set(
    "select",
    "id,display_name,issn_l,issn,type,country_code,summary_stats"
  );
  url.searchParams.set("mailto", "hello@smartsari.my.id");

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return map;

  const data = (await res.json()) as { results?: OpenAlexSourceMeta[] };
  for (const s of data.results ?? []) {
    if (s.issn_l) map.set(s.issn_l.toUpperCase(), s);
    for (const issn of s.issn ?? []) {
      map.set(issn.toUpperCase(), s);
    }
  }
  return map;
}

async function fetchOpenAlexWorks(
  query: string,
  filter: string,
  limit: number,
  page = 1
): Promise<OpenAlexWork[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("filter", filter);
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set("per-page", String(limit));
  url.searchParams.set("page", String(page));
  url.searchParams.set("mailto", "hello@smartsari.my.id");

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`OpenAlex HTTP ${res.status}`);
  }

  const data = (await res.json()) as { results?: OpenAlexWork[] };
  return data.results ?? [];
}

export async function searchOpenAlexByTiers(
  query: string,
  tiers: JournalTier[],
  limit = 45,
  pdfOnly = false,
  page = 1
): Promise<JournalPaper[]> {
  const wantsQ = tiers.some((t) => t.startsWith("Q"));
  const wantsSinta = tiers.some((t) => t.startsWith("SINTA"));
  const oaPart = pdfOnly ? ",open_access.is_oa:true" : "";

  const workBatches: Promise<OpenAlexWork[]>[] = [];
  if (wantsQ) {
    workBatches.push(
      fetchOpenAlexWorks(
        query,
        `primary_location.source.type:journal${oaPart}`,
        limit,
        page
      )
    );
  }
  if (wantsSinta) {
    workBatches.push(
      fetchOpenAlexWorks(
        query,
        `primary_location.source.type:journal,primary_location.source.country_code:ID${oaPart}`,
        35,
        page
      )
    );
  }

  const settled = await Promise.allSettled(workBatches);
  const results: OpenAlexWork[] = [];
  let anySuccess = false;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      anySuccess = true;
      results.push(...s.value);
    }
  }
  if (!anySuccess && settled[0]?.status === "rejected") {
    throw settled[0].reason;
  }

  const sourceIds = results
    .map((w) =>
      (w.primary_location?.source?.id || w.best_oa_location?.source?.id || "")
        .replace("https://openalex.org/", "")
        .trim()
    )
    .filter(Boolean);

  const sourceMap = await fetchOpenAlexSourcesByIds(sourceIds);

  const matchedPapers: JournalPaper[] = [];
  for (const item of results) {
    if (!item.title) continue;
    const rawSourceId = (
      item.primary_location?.source?.id ||
      item.best_oa_location?.source?.id ||
      ""
    )
      .replace("https://openalex.org/", "")
      .trim();

    const sourceMeta = rawSourceId ? sourceMap.get(rawSourceId) : undefined;
    if (!sourceMeta) continue;

    const metrics = classifyJournalMetrics(sourceMeta, tiers);
    if (!metrics) continue;

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
      sourceMeta.display_name ||
      item.primary_location?.source?.display_name ||
      item.best_oa_location?.source?.display_name ||
      null;

    matchedPapers.push({
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

  return matchedPapers;
}

export async function searchEuropePmcByTiers(
  query: string,
  tiers: JournalTier[],
  limit = 20,
  page = 1
): Promise<JournalPaper[]> {
  if (!tiers.some((t) => t.startsWith("Q"))) {
    return [];
  }

  const url = new URL(
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
  );
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", String(Math.min(100, limit * page)));

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`Europe PMC HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    resultList?: {
      result?: Array<{
        id?: string;
        pmcid?: string;
        title?: string;
        authorString?: string;
        pubYear?: string;
        journalTitle?: string;
        journalInfo?: {
          journal?: {
            issn?: string;
            essn?: string;
            title?: string;
          };
        };
        language?: string;
        abstractText?: string;
        doi?: string;
        citedByCount?: number;
        isOpenAccess?: string;
        fullTextUrlList?: {
          fullTextUrl?: Array<{
            documentStyle?: string;
            url?: string;
          }>;
        };
      }>;
    };
  };

  const results = (data.resultList?.result ?? []).slice(
    (page - 1) * limit,
    page * limit
  );
  const issns = results
    .flatMap((r) => [
      r.journalInfo?.journal?.issn,
      r.journalInfo?.journal?.essn,
    ])
    .filter((v): v is string => Boolean(v));

  const issnMap = await fetchOpenAlexSourcesByIssns(issns);
  const matchedPapers: JournalPaper[] = [];

  for (const item of results) {
    if (!item.title) continue;

    const issn1 = item.journalInfo?.journal?.issn?.toUpperCase();
    const issn2 = item.journalInfo?.journal?.essn?.toUpperCase();
    const sourceMeta =
      (issn1 ? issnMap.get(issn1) : undefined) ||
      (issn2 ? issnMap.get(issn2) : undefined);

    if (!sourceMeta) continue;
    const metrics = classifyJournalMetrics(sourceMeta, tiers);
    if (!metrics) continue;

    const title = item.title.replace(/<[^>]+>/g, "").trim();
    const doi = cleanDoi(item.doi);
    const urls = item.fullTextUrlList?.fullTextUrl ?? [];
    const pdfEntry = urls.find(
      (u) => u.documentStyle?.toLowerCase() === "pdf" && u.url
    );

    let pdfUrl = pdfEntry?.url ?? null;
    if (!pdfUrl && item.isOpenAccess === "Y" && item.pmcid) {
      pdfUrl = `https://europepmc.org/articles/${item.pmcid}?pdf=render`;
    }

    const landingUrl =
      urls.find((u) => u.url)?.url ||
      (item.pmcid
        ? `https://europepmc.org/article/PMC/${item.pmcid.replace(/^PMC/i, "")}`
        : doi
          ? `https://doi.org/${doi}`
          : null);

    const authors = (item.authorString ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);

    const year = item.pubYear ? Number(item.pubYear) || null : null;

    matchedPapers.push({
      paperKey: makePaperKey("europepmc", doi, title, item.id),
      title,
      authors,
      year,
      venue:
        sourceMeta.display_name ||
        item.journalTitle ||
        item.journalInfo?.journal?.title ||
        "Europe PMC",
      source: "europepmc",
      abstract: item.abstractText
        ? item.abstractText.replace(/<[^>]+>/g, "").trim()
        : null,
      pdfUrl,
      landingUrl,
      doi,
      citations: item.citedByCount ?? null,
      openAccess: item.isOpenAccess === "Y" || Boolean(pdfUrl),
      language: item.language?.toUpperCase() || null,
      journalMetrics: metrics,
    });
  }

  return matchedPapers;
}

export async function searchCrossrefByTiers(
  query: string,
  tiers: JournalTier[],
  limit = 20,
  page = 1
): Promise<JournalPaper[]> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(limit));
  url.searchParams.set("offset", String((page - 1) * limit));
  url.searchParams.set("filter", "type:journal-article");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "SmartSari/2.0 (mailto:hello@smartsari.my.id)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) {
    throw new Error(`Crossref HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    message?: {
      items?: Array<{
        DOI?: string;
        title?: string[];
        author?: Array<{ given?: string; family?: string }>;
        "container-title"?: string[];
        ISSN?: string[];
        issued?: { "date-parts"?: number[][] };
        published?: { "date-parts"?: number[][] };
        "is-referenced-by-count"?: number;
        abstract?: string;
        URL?: string;
        language?: string;
        link?: Array<{ URL?: string; "content-type"?: string }>;
      }>;
    };
  };

  const items = data.message?.items ?? [];
  const issns = items
    .flatMap((it) => it.ISSN ?? [])
    .filter((v): v is string => Boolean(v));

  const issnMap = await fetchOpenAlexSourcesByIssns(issns);
  const matchedPapers: JournalPaper[] = [];

  for (const item of items) {
    const rawTitle = item.title?.[0]?.replace(/<[^>]+>/g, "").trim();
    if (!rawTitle) continue;

    let sourceMeta: OpenAlexSourceMeta | undefined;
    for (const issn of item.ISSN ?? []) {
      const found = issnMap.get(issn.toUpperCase());
      if (found) {
        sourceMeta = found;
        break;
      }
    }
    if (!sourceMeta) continue;

    const metrics = classifyJournalMetrics(sourceMeta, tiers);
    if (!metrics) continue;

    const doi = cleanDoi(item.DOI);
    const pdfLink = item.link?.find(
      (l) => l["content-type"]?.toLowerCase().includes("pdf") && l.URL
    );
    const pdfUrl = pdfLink?.URL ?? null;
    const landingUrl = item.URL || (doi ? `https://doi.org/${doi}` : null);

    const authors = (item.author ?? [])
      .map((a) => [a.given, a.family].filter(Boolean).join(" ").trim())
      .filter(Boolean)
      .slice(0, 8);

    const year =
      item.issued?.["date-parts"]?.[0]?.[0] ??
      item.published?.["date-parts"]?.[0]?.[0] ??
      null;

    const abstract = item.abstract
      ? item.abstract
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : null;

    matchedPapers.push({
      paperKey: makePaperKey("crossref", doi, rawTitle),
      title: rawTitle,
      authors,
      year,
      venue: sourceMeta.display_name || item["container-title"]?.[0] || null,
      source: "crossref",
      abstract,
      pdfUrl,
      landingUrl,
      doi,
      citations: item["is-referenced-by-count"] ?? null,
      openAccess: Boolean(pdfUrl),
      language: item.language?.toUpperCase() || null,
      journalMetrics: metrics,
    });
  }

  return matchedPapers;
}
