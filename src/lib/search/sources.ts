import type { JournalMetrics, JournalPaper } from "@/lib/types";

const REQUEST_HEADERS = {
  "User-Agent": "PustakaCari/2.0 (mailto:pustakacari@autosearch.app)",
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

interface OpenAlexSourceMeta {
  id?: string;
  display_name?: string;
  issn_l?: string;
  issn?: string[];
  type?: string;
  summary_stats?: {
    "2yr_mean_citedness"?: number;
    h_index?: number;
  };
}

function cleanDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  return trimmed.length > 0 ? trimmed : null;
}

function makePaperKey(
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

function reconstructOpenAlexAbstract(
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

function toQ1Metrics(src: OpenAlexSourceMeta): JournalMetrics | null {
  if (src.type !== "journal") return null;
  const nameLower = (src.display_name || "").toLowerCase();
  if (PREPRINT_BLOCKLIST.some((blocked) => nameLower.includes(blocked))) {
    return null;
  }

  const c2y = src.summary_stats?.["2yr_mean_citedness"] ?? 0;
  const hIndex = src.summary_stats?.h_index ?? 0;

  const qualifiesQ1 = (c2y >= 3.5 && hIndex >= 50) || c2y >= 5.0;
  if (!qualifiesQ1) return null;

  return {
    quartile: "Q1",
    impactFactor: Number(c2y.toFixed(2)),
    hIndex,
    issn: src.issn_l ?? src.issn?.[0] ?? null,
  };
}

async function fetchOpenAlexSourcesByIds(
  ids: string[]
): Promise<Map<string, OpenAlexSourceMeta>> {
  const map = new Map<string, OpenAlexSourceMeta>();
  const unique = Array.from(new Set(ids)).slice(0, 50);
  if (unique.length === 0) return map;

  const url = new URL("https://api.openalex.org/sources");
  url.searchParams.set("filter", `openalex:${unique.join("|")}`);
  url.searchParams.set("per-page", "50");
  url.searchParams.set("select", "id,display_name,issn_l,issn,type,summary_stats");
  url.searchParams.set("mailto", "pustakacari@autosearch.app");

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return map;

  const data = (await res.json()) as { results?: OpenAlexSourceMeta[] };
  for (const s of data.results ?? []) {
    if (s.id) {
      const shortId = s.id.replace("https://openalex.org/", "");
      map.set(shortId, s);
      map.set(s.id, s);
    }
  }
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
  url.searchParams.set("select", "id,display_name,issn_l,issn,type,summary_stats");
  url.searchParams.set("mailto", "pustakacari@autosearch.app");

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(10000),
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

export async function searchOpenAlexQ1(
  query: string,
  limit = 45,
  pdfOnly = false
): Promise<JournalPaper[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set(
    "filter",
    pdfOnly
      ? "primary_location.source.type:journal,open_access.is_oa:true"
      : "primary_location.source.type:journal"
  );
  url.searchParams.set("per-page", String(limit));
  url.searchParams.set("mailto", "pustakacari@autosearch.app");

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`OpenAlex HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      id?: string;
      title?: string;
      publication_year?: number;
      cited_by_count?: number;
      doi?: string;
      language?: string;
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
    }>;
  };

  const results = data.results ?? [];
  const sourceIds = results
    .map((w) =>
      (w.primary_location?.source?.id || w.best_oa_location?.source?.id || "")
        .replace("https://openalex.org/", "")
        .trim()
    )
    .filter(Boolean);

  const sourceMap = await fetchOpenAlexSourcesByIds(sourceIds);

  const q1Papers: JournalPaper[] = [];
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

    const metrics = toQ1Metrics(sourceMeta);
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

    q1Papers.push({
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

  return q1Papers;
}

export async function searchEuropePmcQ1(
  query: string,
  limit = 20
): Promise<JournalPaper[]> {
  const url = new URL(
    "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
  );
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("resultType", "core");
  url.searchParams.set("pageSize", String(limit));

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(10000),
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

  const results = data.resultList?.result ?? [];
  const issns = results
    .flatMap((r) => [
      r.journalInfo?.journal?.issn,
      r.journalInfo?.journal?.essn,
    ])
    .filter((v): v is string => Boolean(v));

  const issnMap = await fetchOpenAlexSourcesByIssns(issns);
  const q1Papers: JournalPaper[] = [];

  for (const item of results) {
    if (!item.title) continue;

    const issn1 = item.journalInfo?.journal?.issn?.toUpperCase();
    const issn2 = item.journalInfo?.journal?.essn?.toUpperCase();
    const sourceMeta =
      (issn1 ? issnMap.get(issn1) : undefined) ||
      (issn2 ? issnMap.get(issn2) : undefined);

    if (!sourceMeta) continue;
    const metrics = toQ1Metrics(sourceMeta);
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

    q1Papers.push({
      paperKey: makePaperKey("europepmc", doi, title, item.id),
      title,
      authors,
      year,
      venue:
        sourceMeta.display_name ||
        item.journalTitle ||
        item.journalInfo?.journal?.title ||
        "Europe PMC Q1",
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

  return q1Papers;
}
