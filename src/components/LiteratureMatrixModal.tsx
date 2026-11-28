"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Layers,
  LayoutGrid,
  Lightbulb,
  Loader2,
  Table2,
  X,
} from "lucide-react";
import { FootnoteLinkedText, jumpToAnchor } from "@/lib/footnote-links";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import type { LiteratureMatrixResult } from "@/lib/types";

interface LiteratureMatrixModalProps {
  matrix: LiteratureMatrixResult;
  onClose: () => void;
}

function escapeCsv(val: string): string {
  const raw = val || "";
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  const safe = formulaSafe.replace(/"/g, '""');
  return `"${safe}"`;
}

function renderParagraphs(
  text: string,
  rowTitles: string[]
) {
  const blocks = (text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return (
      <p className="text-[13.5px] leading-[1.7] text-ink-muted">
        Tidak ada ringkasan tersedia.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {blocks.map((paragraph, idx) => (
        <p
          key={idx}
          className="text-[13.5px] leading-[1.7] text-ink-strong"
        >
          <FootnoteLinkedText
            text={paragraph}
            idPrefix="matrix-paper-"
            maxIndex={rowTitles.length}
            titles={rowTitles}
          />
        </p>
      ))}
    </div>
  );
}

export function LiteratureMatrixModal({
  matrix,
  onClose,
}: LiteratureMatrixModalProps) {
  useBodyScrollLock(true);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [copiedSection, setCopiedSection] = useState<
    "synthesis" | "gaps" | "markdown" | null
  >(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "table"
  );

  const handleCopyText = async (
    section: "synthesis" | "gaps" | "markdown",
    text: string
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleCopyMarkdown = () => {
    const cleanCell = (s: string) =>
      (s || "-").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
    const lines = [
      "## Sintesis Lintas Jurnal",
      matrix.synthesis,
      "",
      "## Celah Penelitian (Research Gaps)",
      matrix.researchGaps,
      "",
      "## Tabel Perbandingan Jurnal",
      "| Jurnal | Penulis & Tahun | Tier | Tujuan | Metode | Sampel / Data | Temuan Utama | Keterbatasan |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      ...matrix.rows.map(
        (r) =>
          `| ${cleanCell(r.title)} | ${cleanCell(r.authorsYear)} | ${cleanCell(r.tier)} | ${cleanCell(r.objective)} | ${cleanCell(r.method)} | ${cleanCell(r.sample)} | ${cleanCell(r.findings)} | ${cleanCell(r.limitations)} |`
      ),
    ];
    void handleCopyText("markdown", lines.join("\n"));
  };

  const handleDownloadCsv = () => {
    const headers = [
      "Judul Jurnal",
      "Penulis & Tahun",
      "Tier",
      "Tujuan",
      "Metode",
      "Sampel / Data",
      "Temuan Utama",
      "Keterbatasan",
    ];
    const rows = matrix.rows.map((r) =>
      [
        r.title,
        r.authorsYear,
        r.tier,
        r.objective,
        r.method,
        r.sample,
        r.findings,
        r.limitations,
      ]
        .map(escapeCsv)
        .join(",")
    );
    const csv = `\uFEFF${headers.map(escapeCsv).join(",")}\n${rows.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "matriks-literatur-smartsari.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDocx = async () => {
    setDownloadingDocx(true);
    try {
      const res = await fetch("/api/ai/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportDocx: true, matrix }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "matriks-literatur-smartsari.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingDocx(false);
    }
  };

  const rowTitles = matrix.rows.map((r) => r.title);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-2.5 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Matriks Literatur & Sintesis"
    >
      <div className="animate-modal-in flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface text-ink shadow-2xl">
        {/* Header */}
        <div className="border-b border-line bg-surface/95 px-4 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-soft ring-1 ring-accent/25">
                <Table2 className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold tracking-tight text-heading sm:text-lg">
                  Matriks Literatur &amp; Sintesis
                </h2>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  {matrix.rows.length} jurnal dibandingkan · SmartSari by AirEvo
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Matriks Literatur"
              className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-full border border-line-strong bg-elevated text-ink-secondary transition-colors hover:border-line-hover hover:text-heading"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Export Toolbar */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading"
            >
              {copiedSection === "markdown" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-ok" />
                  <span className="text-ok">Markdown tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-accent-soft" />
                  <span>Salin Markdown</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-line-strong bg-elevated px-3.5 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/45 hover:text-heading"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-accent-soft" />
              <span>Unduh CSV</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadDocx()}
              disabled={downloadingDocx}
              className="btn-tactile inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {downloadingDocx ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Unduh Word (.docx)</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
          {/* Editorial Synthesis & Research Gaps */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-accent/30 border-t-2 border-t-accent bg-canvas p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-soft">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-soft">
                    Sintesis Lintas Jurnal
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText("synthesis", matrix.synthesis)
                  }
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-heading"
                >
                  {copiedSection === "synthesis" ? (
                    <>
                      <Check className="h-3 w-3 text-ok" />
                      <span className="text-ok">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
              {renderParagraphs(matrix.synthesis, rowTitles)}
            </section>

            <section className="rounded-2xl border border-line-strong border-t-2 border-t-line-hover bg-canvas p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-elevated text-accent-soft">
                    <Lightbulb className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-heading">
                    Celah Penelitian (Research Gaps)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyText("gaps", matrix.researchGaps)}
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-heading"
                >
                  {copiedSection === "gaps" ? (
                    <>
                      <Check className="h-3 w-3 text-ok" />
                      <span className="text-ok">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Salin</span>
                    </>
                  )}
                </button>
              </div>
              {renderParagraphs(matrix.researchGaps, rowTitles)}
            </section>
          </div>

          {/* Clickable Footnote / Reference Index */}
          {matrix.rows.length > 0 && (
            <nav
              aria-label="Indeks catatan referensi jurnal"
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas/80 px-4 py-2.5 text-xs"
            >
              <span className="shrink-0 font-semibold text-ink-secondary">
                Indeks Jurnal:
              </span>
              {matrix.rows.map((row, idx) => (
                <a
                  key={idx}
                  href={`#matrix-paper-${idx + 1}`}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpToAnchor(`matrix-paper-${idx + 1}`);
                  }}
                  title={row.title}
                  className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[11px] text-ink-strong transition-colors hover:border-accent-soft hover:text-heading"
                >
                  <span className="font-mono font-semibold text-accent-soft">
                    [{idx + 1}]
                  </span>
                  <span className="truncate">{row.title}</span>
                </a>
              ))}
            </nav>
          )}

          {/* Comparison Matrix Header & View Switcher */}
          <section className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-heading">
                  Perbandingan Detail Jurnal
                </h3>
                <span className="rounded-full border border-line-strong bg-elevated px-2.5 py-0.5 font-mono text-[11px] font-medium text-ink-secondary">
                  {matrix.rows.length} artikel
                </span>
              </div>

              <div
                role="tablist"
                aria-label="Mode tampilan matriks"
                className="inline-flex items-center rounded-full border border-line-strong bg-canvas p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                  className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === "table"
                      ? "bg-accent text-white shadow-sm"
                      : "text-ink-secondary hover:text-heading"
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>Tabel</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === "cards"}
                  onClick={() => setViewMode("cards")}
                  className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === "cards"
                      ? "bg-accent text-white shadow-sm"
                      : "text-ink-secondary hover:text-heading"
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Kartu</span>
                </button>
              </div>
            </div>

            {viewMode === "table" ? (
              <div className="overflow-x-auto rounded-2xl border border-line-strong bg-canvas shadow-sm">
                <table className="w-full min-w-[1160px] border-collapse text-left text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-elevated/95 backdrop-blur-sm">
                    <tr className="border-b border-line-strong text-[11px] uppercase tracking-wider text-ink-secondary">
                      <th className="sticky left-0 z-20 w-[260px] border-r border-line bg-elevated/95 px-4 py-3 font-semibold text-heading">
                        Jurnal
                      </th>
                      <th className="min-w-[180px] px-4 py-3 font-semibold">
                        Tujuan
                      </th>
                      <th className="min-w-[180px] px-4 py-3 font-semibold">
                        Metode
                      </th>
                      <th className="min-w-[175px] px-4 py-3 font-semibold">
                        Sampel / Data
                      </th>
                      <th className="min-w-[220px] bg-accent/[0.06] px-4 py-3 font-semibold text-accent-soft">
                        Temuan Utama
                      </th>
                      <th className="min-w-[180px] px-4 py-3 font-semibold">
                        Keterbatasan
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {matrix.rows.map((row, idx) => (
                      <tr
                        key={idx}
                        id={`matrix-paper-${idx + 1}`}
                        className="group scroll-mt-4 align-top transition-colors even:bg-surface/55 hover:bg-elevated/65"
                      >
                        <td className="sticky left-0 z-[5] w-[260px] border-r border-line bg-canvas px-4 py-3.5 transition-colors group-even:bg-surface group-hover:bg-elevated/95">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded bg-elevated px-1.5 font-mono text-[10px] font-semibold text-ink-secondary">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-soft">
                              {row.tier}
                            </span>
                          </div>
                          <p className="font-semibold leading-snug text-heading">
                            {row.title}
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-ink-secondary">
                            {row.authorsYear}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 leading-relaxed text-ink-body">
                          {row.objective}
                        </td>
                        <td className="px-4 py-3.5 leading-relaxed text-ink-body">
                          {row.method}
                        </td>
                        <td className="px-4 py-3.5 leading-relaxed text-ink-body">
                          {row.sample}
                        </td>
                        <td className="bg-accent/[0.04] px-4 py-3.5 leading-relaxed text-ink-strong">
                          {row.findings}
                        </td>
                        <td className="px-4 py-3.5 leading-relaxed text-ink-body">
                          {row.limitations}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-3.5">
                {matrix.rows.map((row, idx) => (
                  <article
                    key={idx}
                    id={`matrix-paper-${idx + 1}`}
                    className="scroll-mt-4 rounded-2xl border border-line-strong bg-canvas p-4 shadow-sm sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-5 min-w-[26px] items-center justify-center rounded bg-elevated px-1.5 font-mono text-[11px] font-semibold text-ink-secondary">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-soft">
                            {row.tier}
                          </span>
                          <span className="text-xs text-ink-secondary">
                            {row.authorsYear}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold leading-snug text-heading sm:text-[15px]">
                          {row.title}
                        </h4>
                      </div>
                    </div>

                    <div className="mt-3.5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      {[
                        { label: "Tujuan", value: row.objective },
                        { label: "Metode", value: row.method },
                        { label: "Sampel / Data", value: row.sample },
                        { label: "Keterbatasan", value: row.limitations },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-line bg-surface/75 p-3"
                        >
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">
                            {item.label}
                          </span>
                          <p className="text-xs leading-relaxed text-ink-body">
                            {item.value}
                          </p>
                        </div>
                      ))}

                      <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-3.5 md:col-span-2 lg:col-span-4">
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-accent-soft">
                          Temuan Utama
                        </span>
                        <p className="text-[13px] leading-relaxed text-ink-strong">
                          {row.findings}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
