import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export interface SearchFilters {
  sources?: string[];
  tiers?: string[];
  pdfOnly?: boolean;
  yearFrom?: number | null;
  sort?: string;
}

export const searchHistory = pgTable("search_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: text("session_id").notNull().default("global"),
  query: text("query").notNull(),
  filters: jsonb("filters").$type<SearchFilters>(),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const emailOtpChallenges = pgTable("email_otp_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  otpHash: text("otp_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const researchProjects = pgTable("research_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: text("session_id").notNull().default("global"),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#F472B6"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: text("session_id").notNull().default("global"),
    paperKey: text("paper_key").notNull(),
    title: text("title").notNull(),
    authors: jsonb("authors").$type<string[]>().notNull(),
    year: integer("year"),
    venue: text("venue"),
    source: text("source").notNull(),
    abstract: text("abstract"),
    pdfUrl: text("pdf_url"),
    landingUrl: text("landing_url"),
    doi: text("doi"),
    citations: integer("citations"),
    projectId: uuid("project_id").references(() => researchProjects.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    tierLabel: text("tier_label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("bookmarks_session_paper_idx").on(
      table.sessionId,
      table.paperKey
    ),
  ]
);

export const conversions = pgTable("conversions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: text("session_id").notNull().default("global"),
  paperKey: text("paper_key").notNull(),
  title: text("title").notNull(),
  authors: jsonb("authors").$type<string[]>(),
  year: integer("year"),
  mode: text("mode").notNull(),
  pdfUrl: text("pdf_url"),
  model: text("model").notNull(),
  markdownContent: text("markdown_content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const searchCache = pgTable("search_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
