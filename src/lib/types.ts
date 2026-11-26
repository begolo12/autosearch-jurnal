export type SearchSource = "openalex" | "arxiv" | "europepmc" | "doaj";

export type ConversionMode = "clean" | "translate_id" | "summary_id";

export type SortOption = "relevance" | "newest" | "citations";

export interface JournalPaper {
  paperKey: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  source: SearchSource;
  abstract: string | null;
  pdfUrl: string | null;
  landingUrl: string | null;
  doi: string | null;
  citations: number | null;
  openAccess: boolean;
}

export interface SourceStat {
  source: SearchSource;
  count: number;
  ok: boolean;
  error?: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  papers: JournalPaper[];
  sourceStats: SourceStat[];
}

export interface BookmarkRecord {
  id: string;
  paperKey: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  source: string;
  abstract: string | null;
  pdfUrl: string | null;
  landingUrl: string | null;
  doi: string | null;
  citations: number | null;
  createdAt: string;
}

export interface ConversionRecord {
  id: string;
  paperKey: string;
  title: string;
  authors: string[] | null;
  year: number | null;
  mode: ConversionMode;
  pdfUrl: string | null;
  model: string;
  markdownContent: string;
  createdAt: string;
}

export interface SearchHistoryRecord {
  id: string;
  query: string;
  filters: {
    sources?: string[];
    pdfOnly?: boolean;
    yearFrom?: number | null;
    sort?: string;
  } | null;
  resultCount: number;
  createdAt: string;
}
