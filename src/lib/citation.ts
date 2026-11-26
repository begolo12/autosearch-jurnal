import type { JournalPaper } from "@/lib/types";

export type CitationFormat = "apa" | "ieee" | "bibtex";

function formatApaAuthor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.trim();
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(" ");
  return `${last}, ${initials}`;
}

function formatIeeeAuthor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name.trim();
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(" ");
  return `${initials} ${last}`;
}

export function formatApa(paper: JournalPaper): string {
  const authors =
    paper.authors.length === 0
      ? "Anonim"
      : paper.authors.length === 1
        ? formatApaAuthor(paper.authors[0])
        : paper.authors.length <= 5
          ? `${paper.authors
              .slice(0, -1)
              .map(formatApaAuthor)
              .join(", ")}, & ${formatApaAuthor(
              paper.authors[paper.authors.length - 1]
            )}`
          : `${formatApaAuthor(paper.authors[0])}, dkk.`;

  const year = paper.year ? `(${paper.year})` : "(t.t.)";
  const venue = paper.venue ? ` ${paper.venue}.` : "";
  const doi = paper.doi ? ` https://doi.org/${paper.doi}` : "";

  return `${authors} ${year}. ${paper.title}.${venue}${doi}`.trim();
}

export function formatIeee(paper: JournalPaper): string {
  const authors =
    paper.authors.length === 0
      ? "Anonim"
      : paper.authors.length <= 3
        ? paper.authors.map(formatIeeeAuthor).join(", ")
        : `${formatIeeeAuthor(paper.authors[0])} et al.`;

  const venue = paper.venue ? `, ${paper.venue}` : "";
  const year = paper.year ? `, ${paper.year}` : "";
  const doi = paper.doi ? `, doi: ${paper.doi}` : "";

  return `${authors}, "${paper.title}"${venue}${year}${doi}.`.trim();
}

export function formatBibtex(paper: JournalPaper): string {
  const firstLast =
    paper.authors[0]?.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z0-9]/g, "") ||
    "author";
  const yr = paper.year || "nd";
  const key = `${firstLast.toLowerCase()}${yr}`;

  const lines = [
    `@article{${key},`,
    `  title = {${paper.title}},`,
    paper.authors.length > 0
      ? `  author = {${paper.authors.join(" and ")}},`
      : null,
    paper.venue ? `  journal = {${paper.venue}},` : null,
    paper.year ? `  year = {${paper.year}},` : null,
    paper.doi ? `  doi = {${paper.doi}},` : null,
    paper.landingUrl && !paper.doi ? `  url = {${paper.landingUrl}},` : null,
    `}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export function formatCitation(
  paper: JournalPaper,
  format: CitationFormat
): string {
  if (format === "ieee") return formatIeee(paper);
  if (format === "bibtex") return formatBibtex(paper);
  return formatApa(paper);
}

export function formatRis(paper: JournalPaper): string {
  const lines: string[] = ["TY  - JOUR", `TI  - ${paper.title}`];
  for (const author of paper.authors) {
    if (author.trim()) lines.push(`AU  - ${author.trim()}`);
  }
  if (paper.year) lines.push(`PY  - ${paper.year}`);
  if (paper.venue) lines.push(`JO  - ${paper.venue}`);
  if (paper.doi) lines.push(`DO  - ${paper.doi}`);
  if (paper.landingUrl) lines.push(`UR  - ${paper.landingUrl}`);
  if (paper.abstract) {
    lines.push(`AB  - ${paper.abstract.replace(/\s+/g, " ").trim()}`);
  }
  lines.push("ER  - ");
  return lines.join("\n");
}

export function exportCitationsBib(papers: JournalPaper[]): string {
  return papers.map((p) => formatBibtex(p)).join("\n\n");
}

export function exportCitationsRis(papers: JournalPaper[]): string {
  return papers.map((p) => formatRis(p)).join("\n\n");
}

export function formatRelativeTimeId(isoDate: string): string {
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return "Baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} hr`;
  return new Date(isoDate).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}
