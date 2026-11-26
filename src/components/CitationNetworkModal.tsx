"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  BookOpenText,
  ChevronRight,
  ExternalLink,
  GitBranch,
  Languages,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { CitationNetworkResponse, JournalPaper } from "@/lib/types";

interface CitationNetworkModalProps {
  initialPaper: JournalPaper;
  bookmarkedKeys: Set<string>;
  onClose: () => void;
  onToggleBookmark: (paper: JournalPaper) => Promise<void>;
  onOpenReader: (paper: JournalPaper, autoTranslate?: boolean) => void;
  onBuildMatrix: (papers: JournalPaper[]) => Promise<void>;
}

type NetworkTab = "citing" | "references" | "related";

export function CitationNetworkModal({
  initialPaper,
  bookmarkedKeys,
  onClose,
  onToggleBookmark,
  onOpenReader,
  onBuildMatrix,
}: CitationNetworkModalProps) {
  const [trail, setTrail] = useState<JournalPaper[]>([initialPaper]);
  const activeSeed = trail[trail.length - 1];

  const [activeTab, setActiveTab] = useState<NetworkTab>("citing");
  const [showGraph, setShowGraph] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<CitationNetworkResponse | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [buildingMatrix, setBuildingMatrix] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setHoveredKey(null);

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
          data.citing.length === 0 &&
          data.references.length > 0
        ) {
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
        if (active) setError("Gangguan koneksi saat memuat jejaring OpenAlex.");
      })
      .finally(() => {
        if (active) setLoading(false);
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
          ? "#DB2777"
          : tier === "Q2" || tier === "SINTA2"
            ? "#F472B6"
            : "#52525B";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Jejaring Literatur & Snowballing"
    >
      <div className="animate-modal-in flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#2C2E35] bg-[#151619] text-[#F4F4F5] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232429] px-5 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#DB2777]/15 text-[#F472B6]">
              <GitBranch className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-white sm:text-base">
                Jejaring Literatur: {activeSeed.title}
              </h2>
              <p className="text-[11px] text-[#A1A1AA]">
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
              className="btn-tactile rounded-lg border border-[#2C2E35] bg-[#1E1F23] px-3 py-1.5 text-xs font-medium text-[#E4E4E7] hover:border-[#F472B6]/40"
            >
              {showGraph ? "Sembunyikan Graf" : "Tampilkan Graf"}
            </button>
            {tabPapers.length > 0 && (
              <button
                type="button"
                disabled={buildingMatrix}
                onClick={() => void handleMatrixFromTab()}
                className="btn-tactile inline-flex items-center gap-1.5 rounded-lg bg-[#DB2777] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#BE185D] disabled:opacity-60"
              >
                {buildingMatrix ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Matriks AI (Top {Math.min(4, 1 + tabPapers.length)})
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup jejaring literatur"
              className="rounded-lg p-1.5 text-[#A1A1AA] hover:bg-[#1E1F23] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Snowballing Breadcrumb Trail */}
        {trail.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-[#232429] bg-[#0E0F12] px-5 py-2 text-[11px]">
            <span className="shrink-0 text-[#71717A]">Jejak Snowball:</span>
            {trail.map((item, idx) => (
              <div key={item.paperKey} className="flex shrink-0 items-center gap-1">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-[#52525B]" />}
                <button
                  type="button"
                  onClick={() => setTrail((prev) => prev.slice(0, idx + 1))}
                  className={`max-w-[180px] truncate rounded px-1.5 py-0.5 ${
                    idx === trail.length - 1
                      ? "bg-[#DB2777]/20 font-semibold text-[#F9A8D4]"
                      : "text-[#A1A1AA] hover:text-white"
                  }`}
                >
                  {item.title}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 3-Tab Bar */}
        <div className="grid grid-cols-3 border-b border-[#232429] bg-[#151619]">
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
                  ? "border-[#DB2777] text-[#F472B6]"
                  : "border-transparent text-[#A1A1AA] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 text-xs text-[#A1A1AA]">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-[#F472B6]" />
              Memetakan sitasi, referensi, dan jurnal terkait dari OpenAlex...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 p-4 text-center text-xs text-[#FCA5A5]">
              {error}
            </div>
          ) : (
            <>
              {/* Interactive Radial SVG Graph */}
              {showGraph && graphNodes.length > 0 && (
                <div className="relative rounded-xl border border-[#232429] bg-[#0E0F12] p-3">
                  <svg
                    viewBox="0 0 640 280"
                    className="h-56 w-full select-none sm:h-64"
                    role="img"
                    aria-label="Graf koneksi sitasi jurnal"
                  >
                    {graphNodes.map((node) => (
                      <path
                        key={`edge-${node.paper.paperKey}`}
                        d={`M 320 140 Q ${(320 + node.x) / 2} ${
                          (140 + node.y) / 2 - 14
                        } ${node.x} ${node.y}`}
                        fill="none"
                        stroke={
                          hoveredKey === node.paper.paperKey
                            ? "#F472B6"
                            : "#2C2E35"
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
                      r={20}
                      fill="#DB2777"
                      stroke="#FBCFE8"
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
                            stroke={isHot ? "#FBCFE8" : "#0E0F12"}
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

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#232429] pt-2 text-[11px] text-[#A1A1AA]">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#DB2777]" />
                        Q1 / SINTA 1
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#F472B6]" />
                        Q2 / SINTA 2
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#52525B]" />
                        Lainnya
                      </span>
                    </div>
                    <span className="truncate text-[#F9A8D4]">
                      {hoveredPaper
                        ? `${hoveredPaper.title} (${hoveredPaper.year || "t.t."})`
                        : "Klik atau arahkan ke simpul untuk melihat detail"}
                    </span>
                  </div>
                </div>
              )}

              {tabPapers.length === 0 ? (
                <div className="rounded-xl border border-[#232429] bg-[#0E0F12] p-6 text-center text-xs text-[#A1A1AA]">
                  Belum ada data {activeTab === "citing" ? "sitasi" : activeTab === "references" ? "referensi" : "jurnal terkait"} untuk artikel ini di OpenAlex.
                </div>
              ) : (
                <div className="divide-y divide-[#232429] rounded-xl border border-[#232429] bg-[#0E0F12]">
                  {tabPapers.map((p, idx) => {
                    const isSaved = bookmarkedKeys.has(p.paperKey);
                    const isHot = hoveredKey === p.paperKey;
                    return (
                      <div
                        key={p.paperKey}
                        id={`net-${p.paperKey}`}
                        onMouseEnter={() => setHoveredKey(p.paperKey)}
                        className={`p-4 transition-colors ${
                          isHot ? "bg-[#151619]" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-mono text-[#71717A]">
                            #{idx + 1}
                          </span>
                          {p.journalMetrics && (
                            <span className="rounded bg-[#DB2777]/20 px-1.5 py-0.5 font-mono font-semibold text-[#F472B6]">
                              {p.journalMetrics.tierLabel}
                            </span>
                          )}
                          {p.year && (
                            <span className="font-mono text-[#A1A1AA]">
                              {p.year}
                            </span>
                          )}
                          {p.venue && (
                            <span className="truncate text-[#A1A1AA]">
                              · {p.venue}
                            </span>
                          )}
                          {p.citations !== null && (
                            <span className="ml-auto font-mono text-[#71717A]">
                              {p.citations.toLocaleString("id-ID")} sitasi
                            </span>
                          )}
                        </div>

                        <h4 className="mt-1 text-sm font-semibold text-white">
                          {p.title}
                        </h4>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenReader(p, !p.pdfUrl)}
                            className="btn-tactile inline-flex items-center gap-1 rounded-full bg-[#DB2777] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#BE185D]"
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
                                ? "border-[#DB2777]/45 bg-[#DB2777]/15 text-[#F9A8D4]"
                                : "border-[#2C2E35] bg-[#1E1F23] text-[#E4E4E7] hover:text-white"
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
                            className="btn-tactile inline-flex items-center gap-1 rounded-full border border-[#2C2E35] bg-[#1E1F23] px-3 py-1 text-[11px] font-medium text-[#F472B6] hover:border-[#F472B6]/45"
                          >
                            <GitBranch className="h-3 w-3" />
                            Telusuri Jejaring
                          </button>

                          {p.landingUrl && (
                            <a
                              href={p.landingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#A1A1AA] hover:text-white"
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
