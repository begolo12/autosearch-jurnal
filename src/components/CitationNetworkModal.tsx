"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  ChevronRight,
  ExternalLink,
  FileDown,
  GitBranch,
  Languages,
  Loader2,
  Search,
  Table2,
  X,
} from "lucide-react";
import { exportCitationsBib } from "@/lib/citation";
import { getCachedNetwork, setCachedNetwork } from "@/lib/local-cache";
import { useBodyScrollLock } from "@/lib/use-scroll-lock";
import type { CitationNetworkResponse, JournalPaper } from "@/lib/types";
import { getSafeHttpUrl } from "@/lib/url";

interface CitationNetworkModalProps {
  initialPaper: JournalPaper;
  initialTrail?: JournalPaper[];
  initialTab?: NetworkTab;
  bookmarkedKeys: Set<string>;
  onStateChange?: (state: {
    trail: JournalPaper[];
    activeTab: NetworkTab;
  }) => void;
  onClose: () => void;
  onToggleBookmark: (paper: JournalPaper) => Promise<void>;
  onOpenReader: (paper: JournalPaper, autoTranslate?: boolean) => void;
  onBuildMatrix: (papers: JournalPaper[]) => Promise<void>;
}

type NetworkTab = "citing" | "references" | "related";

export function CitationNetworkModal({
  initialPaper,
  initialTrail,
  initialTab,
  bookmarkedKeys,
  onStateChange,
  onClose,
  onToggleBookmark,
  onOpenReader,
  onBuildMatrix,
}: CitationNetworkModalProps) {
  useBodyScrollLock(true);
  const [trail, setTrail] = useState<JournalPaper[]>(
    initialTrail && initialTrail.length > 0 ? initialTrail : [initialPaper]
  );
  const activeSeed = trail[trail.length - 1];

  const [activeTab, setActiveTab] = useState<NetworkTab>(
    initialTab ?? "citing"
  );
  const [showGraph, setShowGraph] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<CitationNetworkResponse | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [buildingMatrix, setBuildingMatrix] = useState(false);
  const [networkFilter, setNetworkFilter] = useState("");

  useEffect(() => {
    onStateChange?.({ trail, activeTab });
  }, [trail, activeTab, onStateChange]);

  useEffect(() => {
    let active = true;
    const cacheKey = (activeSeed.doi || activeSeed.title).toLowerCase().trim();

    queueMicrotask(() => {
      if (!active) return;
      setError(null);
      setHoveredKey(null);

      const cached = getCachedNetwork(cacheKey);
      if (cached) {
        setNetwork(cached);
        setLoading(false);
        if (cached.citing.length === 0 && cached.references.length > 0) {
          setActiveTab("references");
        } else if (
          cached.citing.length === 0 &&
          cached.references.length === 0 &&
          cached.related.length > 0
        ) {
          setActiveTab("related");
        }
        return;
      }

      setLoading(true);
      const params = new URLSearchParams({ title: activeSeed.title });
      if (activeSeed.doi) params.set("doi", activeSeed.doi);

      fetch(`/api/network?${params.toString()}`)
        .then(async (res) => {
          const data = (await res.json()) as CitationNetworkResponse & {
            error?: string;
          };
          if (!active) return;
          if (!res.ok) {
            setError(data.error || "Gagal memuat jejaring literatur.");
            return;
          }
          setNetwork(data);
          if (
            data.citing.length > 0 ||
            data.references.length > 0 ||
            data.related.length > 0
          ) {
            setCachedNetwork(cacheKey, data);
          }
          if (data.citing.length === 0 && data.references.length > 0) {
            setActiveTab("references");
          } else if (
            data.citing.length === 0 &&
            data.references.length === 0 &&
            data.related.length > 0
          ) {
            setActiveTab("related");
          }
        })
        .catch(() => {
          if (active)
            setError("Gangguan koneksi saat memuat jejaring OpenAlex.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });

    return () => {
      active = false;
    };
  }, [activeSeed]);

  const tabPapers = useMemo(() => {
    if (!network) return [];
    if (activeTab === "references") return network.references;
    if (activeTab === "related") return network.related;
    return network.citing;
  }, [network, activeTab]);

  const filteredTabPapers = useMemo(() => {
    const q = networkFilter.trim().toLowerCase();
    if (!q) return tabPapers;
    return tabPapers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.venue || "").toLowerCase().includes(q)
    );
  }, [tabPapers, networkFilter]);

  const handleExportTabBib = () => {
    if (tabPapers.length === 0) return;
    const content = exportCitationsBib(tabPapers);
    const blob = new Blob([content], {
      type: "application/x-bibtex;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jejaring-${activeTab}-smartsari.bib`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const graphNodes = useMemo(() => {
    const list = tabPapers.slice(0, 12);
    const cx = 320;
    const cy = 140;
    const rx = 215;
    const ry = 100;

    return list.map((paper, idx) => {
      const angle = (idx / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * ry;
      const tier = paper.journalMetrics?.primaryTier;
      const fill =
        tier === "Q1" || tier === "SINTA1"
          ? "var(--accent)"
          : tier === "Q2" || tier === "SINTA2"
            ? "var(--accent-soft)"
            : "var(--ink-faint)";
      return { paper, x, y, fill };
    });
  }, [tabPapers]);

  const hoveredPaper = useMemo(
    () =>
      graphNodes.find((n) => n.paper.paperKey === hoveredKey)?.paper ?? null,
    [graphNodes, hoveredKey]
  );

  const handleMatrixFromTab = async () => {
    if (tabPapers.length === 0 || buildingMatrix) return;
    setBuildingMatrix(true);
    try {
      await onBuildMatrix([activeSeed, ...tabPapers.slice(0, 3)]);
    } finally {
      setBuildingMatrix(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Jejaring Literatur & Snowballing"
    >
      <div className="animate-modal-in flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface text-ink shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-soft">
              <GitBranch className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-heading sm:text-base">
                Jejaring Literatur: {activeSeed.title}
              </h2>
              <p className="text-[11px] text-ink-secondary">
                {activeSeed.year || "t.t."} ·{" "}
                {network?.citedByCount !== null && network?.citedByCount !== undefined
                  ? `${network.citedByCount.toLocaleString("id-ID")} sitasi OpenAlex`
                  : "Eksplorasi Sitasi & Referensi"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGraph((v) => !v)}
              className="btn-tactile rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
            >
              {showGraph ? "Sembunyikan Graf" : "Tampilkan Graf"}
            </button>
            {tabPapers.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportTabBib}
                  className="btn-tactile inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-elevated px-3 py-1.5 text-xs font-medium text-ink-strong hover:border-accent-soft/40 hover:text-heading"
                >
                  <FileDown className="h-3.5 w-3.5 text-accent-soft" />
                  Ekspor .bib
                </button>
                <button
                  type="button"
                  disabled={buildingMatrix}
                  onClick={() => void handleMatrixFromTab()}
                  className="btn-tactile inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {buildingMatrix ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Table2 className="h-3.5 w-3.5" />
                  )}
                  Matriks AI (Top {Math.min(4, 1 + tabPapers.length)})
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup jejaring literatur"
              className="rounded-lg p-1.5 text-ink-secondary hover:bg-elevated hover:text-heading"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Snowballing Breadcrumb Trail */}
        {trail.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-canvas px-5 py-2 text-[11px]">
            <span className="shrink-0 text-ink-muted">Jejak Snowball:</span>
            {trail.map((item, idx) => (
              <div key={item.paperKey} className="flex shrink-0 items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
                <button
                  type="button"
                  onClick={() => setTrail((prev) => prev.slice(0, idx + 1))}
                  className={`max-w-[180px] truncate rounded px-1.5 py-0.5 ${
                    idx === trail.length - 1
                      ? "bg-accent/20 font-semibold text-accent-tint"
                      : "text-ink-secondary hover:text-heading"
                  }`}
                >
                  {item.title}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 3-Tab Bar */}
        <div className="grid grid-cols-3 border-b border-line bg-surface">
          {(
            [
              {
                id: "citing",
                label: `Yang Mensitasi (${network?.citing.length ?? 0})`,
              },
              {
                id: "references",
                label: `Referensi Utama (${network?.references.length ?? 0})`,
              },
              {
                id: "related",
                label: `Jurnal Terkait (${network?.related.length ?? 0})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setHoveredKey(null);
              }}
              className={`border-b-2 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-accent-soft"
                  : "border-transparent text-ink-secondary hover:text-heading"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 text-xs text-ink-secondary">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-accent-soft" />
              Memetakan sitasi, referensi, dan jurnal terkait dari OpenAlex...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-danger/35 bg-danger/10 p-4 text-center text-xs text-danger-soft">
              {error}
            </div>
          ) : (
            <>
              {/* Interactive Radial SVG Graph */}
              {showGraph && graphNodes.length > 0 && (
                <div className="relative rounded-xl border border-line bg-canvas p-3">
                  <svg
                    viewBox="0 0 640 280"
                    className="h-56 w-full select-none sm:h-64"
                    role="img"
                    aria-label="Graf koneksi sitasi jurnal"
                  >
                    <circle
                      cx={320}
                      cy={140}
                      r={60}
                      fill="none"
                      stroke="var(--border-hairline)"
                      strokeDasharray="3 4"
                    />
                    <circle
                      cx={320}
                      cy={140}
                      r={105}
                      fill="none"
                      stroke="var(--border-hairline)"
                      strokeDasharray="3 4"
                    />
                    {graphNodes.map((node) => (
                      <path
                        key={`edge-${node.paper.paperKey}`}
                        d={`M 320 140 Q ${(320 + node.x) / 2} ${
                          (140 + node.y) / 2 - 14
                        } ${node.x} ${node.y}`}
                        fill="none"
                        stroke={
                          hoveredKey === node.paper.paperKey
                            ? "var(--accent-soft)"
                            : "var(--border-strong)"
                        }
                        strokeWidth={
                          hoveredKey === node.paper.paperKey ? 2 : 1.2
                        }
                      />
                    ))}

                    {/* Center Seed Node */}
                    <circle
                      cx={320}
                      cy={140}
                      r={28}
                      fill="rgba(var(--accent-rgb), 0.16)"
                    />
                    <circle
                      cx={320}
                      cy={140}
                      r={20}
                      fill="var(--accent)"
                      stroke="var(--accent-pale)"
                      strokeWidth={2}
                    />
                    <text
                      x={320}
                      y={144}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="10"
                      fontWeight="700"
                    >
                      UTAMA
                    </text>

                    {/* Orbital Nodes */}
                    {graphNodes.map((node, idx) => {
                      const isHot = hoveredKey === node.paper.paperKey;
                      return (
                        <g
                          key={node.paper.paperKey}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredKey(node.paper.paperKey)}
                          onClick={() => {
                            setHoveredKey(node.paper.paperKey);
                            document
                              .getElementById(`net-${node.paper.paperKey}`)
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "nearest",
                              });
                          }}
                        >
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={isHot ? 14 : 11}
                            fill={node.fill}
                            stroke={isHot ? "var(--accent-pale)" : "var(--bg-main)"}
                            strokeWidth={2}
                          />
                          <text
                            x={node.x}
                            y={node.y + 3.5}
                            textAnchor="middle"
                            fill="#FFFFFF"
                            fontSize="9"
                            fontWeight="600"
                          >
                            {idx + 1}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-ink-secondary">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                        Q1 / SINTA 1
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-accent-soft" />
                        Q2 / SINTA 2
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-ink-faint" />
                        Lainnya
                      </span>
                    </div>
                    <span className="truncate text-accent-tint">
                      {hoveredPaper
                        ? `${hoveredPaper.journalMetrics?.tierLabel ? `[${hoveredPaper.journalMetrics.tierLabel}] ` : ""}${hoveredPaper.title} (${hoveredPaper.year || "t.t."}${hoveredPaper.citations !== null ? ` · ${hoveredPaper.citations.toLocaleString("id-ID")} sitasi` : ""})`
                        : "Klik atau arahkan ke simpul untuk melihat detail"}
                    </span>
                  </div>
                </div>
              )}

              {tabPapers.length > 3 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="search"
                    value={networkFilter}
                    onChange={(e) => setNetworkFilter(e.target.value)}
                    placeholder="Filter judul atau jurnal..."
                    className="w-full rounded-xl border border-line bg-canvas py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-muted focus:border-accent-soft focus:outline-none"
                  />
                </div>
              )}

              {tabPapers.length === 0 ? (
                <div className="rounded-xl border border-line bg-canvas p-6 text-center text-xs text-ink-secondary">
                  Belum ada data {activeTab === "citing" ? "sitasi" : activeTab === "references" ? "referensi" : "jurnal terkait"} untuk artikel ini di OpenAlex.
                </div>
              ) : filteredTabPapers.length === 0 ? (
                <div className="rounded-xl border border-line bg-canvas p-6 text-center text-xs text-ink-secondary">
                  Tidak ada artikel yang cocok dengan filter &ldquo;{networkFilter}&rdquo;.
                </div>
              ) : (
                <div className="divide-y divide-line rounded-xl border border-line bg-canvas">
                  {filteredTabPapers.map((p, idx) => {
                    const isSaved = bookmarkedKeys.has(p.paperKey);
                    const isHot = hoveredKey === p.paperKey;
                    return (
                      <div
                        key={p.paperKey}
                        id={`net-${p.paperKey}`}
                        onMouseEnter={() => setHoveredKey(p.paperKey)}
                        className={`p-4 transition-colors ${
                          isHot ? "bg-surface" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-mono text-ink-muted">
                            #{idx + 1}
                          </span>
                          {p.journalMetrics && (
                            <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono font-semibold text-accent-soft">
                              {p.journalMetrics.tierLabel}
                            </span>
                          )}
                          {p.year && (
                            <span className="font-mono text-ink-secondary">
                              {p.year}
                            </span>
                          )}
                          {p.venue && (
                            <span className="truncate text-ink-secondary">
                              · {p.venue}
                            </span>
                          )}
                          {p.citations !== null && (
                            <span className="ml-auto font-mono text-ink-muted">
                              {p.citations.toLocaleString("id-ID")} sitasi
                            </span>
                          )}
                        </div>

                        <h4 className="mt-1 text-sm font-semibold text-heading">
                          {p.title}
                        </h4>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenReader(p, !p.pdfUrl)}
                            className="btn-tactile inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent-hover"
                          >
                            {p.pdfUrl ? (
                              <>
                                <BookOpenText className="h-3 w-3" />
                                Baca PDF
                              </>
                            ) : (
                              <>
                                <Languages className="h-3 w-3" />
                                Terjemahkan ID
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => void onToggleBookmark(p)}
                            className={`btn-tactile inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium ${
                              isSaved
                                ? "border-accent/45 bg-accent/15 text-accent-tint"
                                : "border-line-strong bg-elevated text-ink-strong hover:text-heading"
                            }`}
                          >
                            {isSaved ? (
                              <BookmarkCheck className="h-3 w-3" />
                            ) : (
                              <Bookmark className="h-3 w-3" />
                            )}
                            {isSaved ? "Tersimpan" : "Simpan"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setTrail((prev) => [...prev, p])}
                            className="btn-tactile inline-flex items-center gap-1 rounded-full border border-line-strong bg-elevated px-3 py-1 text-[11px] font-medium text-accent-soft hover:border-accent-soft/45"
                          >
                            <GitBranch className="h-3 w-3" />
                            Telusuri Jejaring
                          </button>

                          {getSafeHttpUrl(p.landingUrl) && (
                            <a
                              href={getSafeHttpUrl(p.landingUrl)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-secondary hover:text-heading"
                            >
                              Sumber <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
