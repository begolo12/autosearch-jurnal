import { XMLParser } from "fast-xml-parser";
import type { JournalPaper } from "@/lib/types";

const REQUEST_HEADERS = {
  "User-Agent": "PustakaCari/1.0 (mailto:pustakacari@autosearch.app)",
  Accept: "application/json, application/xml, text/xml;q=0.9, */*;q=0.8",
};

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

export async function searchOpenAlex(
  query: string,
  limit = 15
): Promise<JournalPaper[]> {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(limit));
  url.searchParams.set("mailto", "pustakacari@autosearch.app");

  const res = await fetch(url.toString(), {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(10000),
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
      abstract_inverted_index?: Record<string, number[]>;
      open_access?: {
        is_oa?: boolean;
        oa_url?: string;
      };
      best_oa_location?: {
        pdf_url?: string;
        landing_page_url?: string;
        source?: { display_name?: string };
      };
      primary_location?: {
        pdf_url?: string;
        landing_page_url?: string;
        source?: { display_name?: string };
      };
      authorships?: Array<{
        author?: { display_name?: string };
      }>;
    }>;
  };

  const results = data.results ?? [];
  return results
    .filter((item) => Boolean(item.title))
    .map((item) => {
      const title = (item.title ?? "").trim();
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
        item.best_oa_location?.source?.display_name ||
        item.primary_location?.source?.display_name ||
        null;

      return {
        paperKey: makePaperKey("openalex", doi, title, item.id),
        title,
        authors,
        year: item.publication_year ?? null,
        venue,
        source: "openalex" as const,
        abstract: reconstructOpenAlexAbstract(item.abstract_inverted_index),
        pdfUrl,
        landingUrl,
        doi,
        citations: item.cited_by_count ?? null,
        openAccess: Boolean(item.open_access?.is_oa || pdfUrl),
      };
    });
}

export async function searchArxiv(
  query: string,
  limit = 12
): Promise<JournalPaper[]> {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(limit));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": REQUEST_HEADERS["User-Agent"] },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`arXiv HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml) as {
    feed?: {
      entry?:
        | Array<Record<string, unknown>>
        | Record<string, unknown>;
    };
  };

  const rawEntries = parsed.feed?.entry;
  const entries = Array.isArray(rawEntries)
    ? rawEntries
    : rawEntries
      ? [rawEntries]
      : [];

  return entries
    .map((entry): JournalPaper | null => {
      const title = String(entry.title ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return null;

      const rawId = String(entry.id ?? "").trim();
      const arxivId = rawId
        .replace(/^https?:\/\/arxiv\.org\/abs\//i, "")
        .replace(/v\d+$/, "");

      const pdfUrl = arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : null;
      const landingUrl = rawId || (arxivId ? `https://arxiv.org/abs/${arxivId}` : null);

      const published = String(entry.published ?? "");
      const yearMatch = published.match(/^(\d{4})/);
      const year = yearMatch ? Number(yearMatch[1]) : null;

      const rawAuthors = entry.author;
      const authorList = Array.isArray(rawAuthors)
        ? rawAuthors
        : rawAuthors
          ? [rawAuthors]
          : [];
      const authors = authorList
        .map((a) => String((a as { name?: unknown }).name ?? "").trim())
        .filter(Boolean)
        .slice(0, 8);

      const abstract = String(entry.summary ?? "")
        .replace(/\s+/g, " ")
        .trim();

      const doi = cleanDoi(
        entry["arxiv:doi"] ? String(entry["arxiv:doi"]) : null
      );

      return {
        paperKey: makePaperKey("arxiv", doi, title, arxivId),
        title,
        authors,
        year,
        venue: "arXiv Preprint",
        source: "arxiv" as const,
        abstract: abstract || null,
        pdfUrl,
        landingUrl,
        doi,
        citations: null,
        openAccess: true,
      };
    })
    .filter((p): p is JournalPaper => p !== null);
}

export async function searchEuropePmc(
  query: string,
  limit = 12
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
        abstractText?: string;
        doi?: string;
        citedByCount?: number;
        isOpenAccess?: string;
        fullTextUrlList?: {
          fullTextUrl?: Array<{
            documentStyle?: string;
            availabilityCode?: string;
            url?: string;
          }>;
        };
      }>;
    };
  };

  const results = data.resultList?.result ?? [];
  return results
    .filter((item) => Boolean(item.title))
    .map((item) => {
      const title = (item.title ?? "").replace(/<[^>]+>/g, "").trim();
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

      return {
        paperKey: makePaperKey("europepmc", doi, title, item.id),
        title,
        authors,
        year,
        venue: item.journalTitle ?? "Europe PMC",
        source: "europepmc" as const,
        abstract: item.abstractText
          ? item.abstractText.replace(/<[^>]+>/g, "").trim()
          : null,
        pdfUrl,
        landingUrl,
        doi,
        citations: item.citedByCount ?? null,
        openAccess: item.isOpenAccess === "Y" || Boolean(pdfUrl),
      };
    });
}

export async function searchDoaj(
  query: string,
  limit = 12
): Promise<JournalPaper[]> {
  const url = `https://doaj.org/api/search/articles/${encodeURIComponent(query)}?pageSize=${limit}`;

  const res = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`DOAJ HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      id?: string;
      bibjson?: {
        title?: string;
        year?: string;
        abstract?: string;
        journal?: { title?: string };
        author?: Array<{ name?: string }>;
        identifier?: Array<{ type?: string; id?: string }>;
        link?: Array<{
          type?: string;
          content_type?: string;
          url?: string;
        }>;
      };
    }>;
  };

  const results = data.results ?? [];
  return results
    .filter((item) => Boolean(item.bibjson?.title))
    .map((item) => {
      const bib = item.bibjson!;
      const title = (bib.title ?? "").trim();
      const doiObj = bib.identifier?.find(
        (id) => id.type?.toLowerCase() === "doi"
      );
      const doi = cleanDoi(doiObj?.id);

      const links = bib.link ?? [];
      const directPdf = links.find(
        (l) =>
          l.url &&
          (l.content_type?.toLowerCase() === "pdf" ||
            l.url.toLowerCase().includes(".pdf"))
      );
      const fulltext = links.find(
        (l) => l.url && l.type?.toLowerCase() === "fulltext"
      );
      const pdfUrl = directPdf?.url ?? null;
      const landingUrl =
        fulltext?.url ||
        directPdf?.url ||
        (doi ? `https://doi.org/${doi}` : null);

      const authors = (bib.author ?? [])
        .map((a) => a.name?.trim())
        .filter((n): n is string => Boolean(n))
        .slice(0, 8);

      const year = bib.year ? Number(bib.year) || null : null;

      return {
        paperKey: makePaperKey("doaj", doi, title, item.id),
        title,
        authors,
        year,
        venue: bib.journal?.title ?? "DOAJ Open Access",
        source: "doaj" as const,
        abstract: bib.abstract?.trim() || null,
        pdfUrl,
        landingUrl,
        doi,
        citations: null,
        openAccess: true,
      };
    });
}
