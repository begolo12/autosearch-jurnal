export type SearchSource = "openalex" | "europepmc" | "crossref";

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
  sintaVerified?: boolean;
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
  customText?: string | null;
  localPdfUrl?: string | null;
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
  page?: number;
  hasMore?: boolean;
  tierCounts?: Partial<Record<JournalTier, number>>;
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
  projectId?: string | null;
  note?: string | null;
  tierLabel?: string | null;
  createdAt: string;
}

export interface ResearchProjectRecord {
  id: string;
  name: string;
  description: string | null;
  color: string;
  bookmarkCount: number;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface DailyQuotaStatus {
  tier: "user" | "guest";
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  globalSaturated: boolean;
}

export interface LiteratureMatrixRow {
  title: string;
  authorsYear: string;
  tier: string;
  objective: string;
  method: string;
  sample: string;
  findings: string;
  limitations: string;
}

export interface LiteratureMatrixResult {
  synthesis: string;
  researchGaps: string;
  rows: LiteratureMatrixRow[];
}

export interface PaperChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SearchResearchBrief {
  overview: string;
  keyFindings: string[];
  dominantMethods: string;
  topRecommendation: string;
  suggestedQueries: Array<{ query: string; label: string }>;
}

export interface PaperTakeaways {
  problem: string;
  method: string;
  finding: string;
  implication: string;
}

export interface CitationNetworkResponse {
  seedTitle: string;
  seedOpenAlexId: string | null;
  citedByCount: number | null;
  citing: JournalPaper[];
  references: JournalPaper[];
  related: JournalPaper[];
}

export interface ConversionRecord {
  id: string;
  paperKey: string;
  title: string;
  authors: string[] | null;
  year: number | null;
  mode: ConversionMode;
  pdfUrl: string | null;
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
