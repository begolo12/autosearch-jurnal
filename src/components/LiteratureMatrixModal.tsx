"use client";

import { useState } from "react";
import { Check, Copy, Download, FileSpreadsheet, Loader2, Sparkles, X } from "lucide-react";
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

export function LiteratureMatrixModal({
  matrix,
  onClose,
}: LiteratureMatrixModalProps) {
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [copiedSection, setCopiedSection] = useState<
    "synthesis" | "gaps" | "markdown" | null
  >(null);

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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Matriks Literatur AI"
    >
      <div className="animate-modal-in flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface text-ink shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent-soft">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-heading">
                Matriks Literatur &amp; Sintesis
              </h2>
              <p className="text-xs text-ink-secondary">
                {matrix.rows.length} jurnal dibandingkan · SmartSari by AirEvo
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="btn-tactile inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
            >
              {copiedSection === "markdown" ? (
                <>
                  <Check className="h-3.5 w-3.5 text-ok" />
                  <span className="text-ok">Tersalin</span>
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
              className="btn-tactile inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-accent-soft" />
              Unduh CSV
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadDocx()}
              disabled={downloadingDocx}
              className="btn-tactile inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {downloadingDocx ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Unduh Word (.docx)
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Matriks Literatur"
              className="rounded-lg p-1.5 text-ink-secondary hover:bg-elevated hover:text-heading"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 via-canvas to-canvas p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-soft">
                  Sintesis Lintas Jurnal
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText("synthesis", matrix.synthesis)
                  }
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-secondary transition-colors hover:bg-elevated hover:text-heading"
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
              <p className="text-sm leading-relaxed text-ink-strong">
                {matrix.synthesis}
              </p>
            </div>
            <div className="rounded-xl border border-line-hover bg-gradient-to-br from-elevated/60 via-canvas to-canvas p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-soft">
                  Celah Penelitian (Research Gaps)
                </h3>
                <button
                  type="button"
                  onClick={() => void handleCopyText("gaps", matrix.researchGaps)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-secondary transition-colors hover:bg-elevated hover:text-heading"
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
              <p className="text-sm leading-relaxed text-ink-strong">
                {matrix.researchGaps}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-canvas">
            <table className="w-full min-w-[920px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-elevated/95 backdrop-blur-sm">
                <tr className="border-b border-line text-accent-tint">
                  <th className="px-3.5 py-2.5 font-semibold">Jurnal</th>
                  <th className="px-3.5 py-2.5 font-semibold">Tier</th>
                  <th className="px-3.5 py-2.5 font-semibold">Tujuan</th>
                  <th className="px-3.5 py-2.5 font-semibold">Metode</th>
                  <th className="px-3.5 py-2.5 font-semibold">Sampel / Data</th>
                  <th className="px-3.5 py-2.5 font-semibold">Temuan Utama</th>
                  <th className="px-3.5 py-2.5 font-semibold">Keterbatasan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {matrix.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="align-top transition-colors even:bg-surface/60 hover:bg-elevated/70"
                  >
                    <td className="max-w-[200px] px-3.5 py-3">
                      <p className="font-medium leading-snug text-heading">
                        {row.title}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-secondary">
                        {row.authorsYear}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-soft">
                        {row.tier}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 leading-relaxed text-ink-body">
                      {row.objective}
                    </td>
                    <td className="px-3.5 py-3 leading-relaxed text-ink-body">
                      {row.method}
                    </td>
                    <td className="px-3.5 py-3 leading-relaxed text-ink-body">
                      {row.sample}
                    </td>
                    <td className="px-3.5 py-3 leading-relaxed text-ink-body">
                      {row.findings}
                    </td>
                    <td className="px-3.5 py-3 leading-relaxed text-ink-body">
                      {row.limitations}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
