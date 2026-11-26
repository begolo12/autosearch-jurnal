import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export interface SearchFilters {
  sources?: string[];
  pdfOnly?: boolean;
  yearFrom?: number | null;
  sort?: string;
}

export const searchHistory = pgTable("search_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  query: text("query").notNull(),
  filters: jsonb("filters").$type<SearchFilters>(),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookmarks = pgTable("bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  paperKey: text("paper_key").notNull().unique(),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const conversions = pgTable("conversions", {
  id: uuid("id").defaultRandom().primaryKey(),
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
