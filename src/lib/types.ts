export type SearchSource = "openalex" | "europepmc";

export type ConversionMode = "clean" | "translate_id" | "summary_id";

export type SortOption = "relevance" | "impact" | "newest" | "citations";

export type QuartileTier = "Q1" | "Q2" | "Q3" | "Q4";

export type SintaTier =
  | "SINTA1"
  | "SINTA2"
  | "SINTA3"
  | "SINTA4"
  | "SINTA5"
  | "SINTA6";

export type JournalTier = QuartileTier | SintaTier;

export const TIER_PRIORITY_ORDER: JournalTier[] = [
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "SINTA1",
  "SINTA2",
  "SINTA3",
  "SINTA4",
  "SINTA5",
  "SINTA6",
];

export interface JournalMetrics {
  quartile?: QuartileTier;
  sinta?: SintaTier;
  primaryTier: JournalTier;
  tierLabel: string;
  impactFactor: number;
  hIndex: number;
  issn: string | null;
  countryCode?: string | null;
}

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
  language?: string | null;
  journalMetrics?: JournalMetrics;
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
    tiers?: JournalTier[];
    pdfOnly?: boolean;
    yearFrom?: number | null;
    sort?: string;
  } | null;
  resultCount: number;
  createdAt: string;
}
