"use client";

import type { ReactNode } from "react";

export function jumpToAnchor(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("footnote-flash");
  // Trigger reflow so repeated clicks re-run the highlight animation
  void el.offsetWidth;
  el.classList.add("footnote-flash");
  window.setTimeout(() => {
    el.classList.remove("footnote-flash");
  }, 1700);
}

interface FootnoteLinkedTextProps {
  text: string;
  idPrefix: string;
  maxIndex?: number;
  titles?: string[];
}

export function FootnoteLinkedText({
  text,
  idPrefix,
  maxIndex,
  titles,
}: FootnoteLinkedTextProps): ReactNode {
  if (!text) return null;

  // Match [1], [1, 2], [1-3], or Jurnal/Studi/Penelitian 1
  const regex =
    /(\[\s*\d+(?:\s*[,;–-]\s*\d+)*\s*\])|\b((?:Jurnal|Studi|Artikel|Penelitian)\s+(\d+))\b/gi;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  const isValidNum = (n: number) =>
    Number.isFinite(n) && n >= 1 && (maxIndex ? n <= maxIndex : n <= 99);

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      const nums = match[1].match(/\d+/g)?.map(Number) ?? [];
      const validNums = nums.filter(isValidNum);
      if (validNums.length === 0) {
        nodes.push(match[0]);
      } else {
        nodes.push(
          <span key={`fn-${keyCounter++}`} className="inline-flex items-baseline gap-0.5">
            {validNums.map((n, i) => (
              <a
                key={`${n}-${i}`}
                href={`#${idPrefix}${n}`}
                onClick={(e) => {
                  e.preventDefault();
                  jumpToAnchor(`${idPrefix}${n}`);
                }}
                title={titles?.[n - 1] || `Lihat catatan ${n}`}
                className="mx-0.5 inline-flex items-center rounded bg-accent/12 px-1 py-0.5 align-baseline font-mono text-[10.5px] font-semibold leading-none text-accent-soft underline decoration-accent/40 underline-offset-2 transition-colors hover:bg-accent/25 hover:text-heading"
              >
                [{n}]
              </a>
            ))}
          </span>
        );
      }
    } else if (match[2] && match[3]) {
      const n = Number(match[3]);
      if (!isValidNum(n)) {
        nodes.push(match[0]);
      } else {
        nodes.push(
          <a
            key={`fn-${keyCounter++}`}
            href={`#${idPrefix}${n}`}
            onClick={(e) => {
              e.preventDefault();
              jumpToAnchor(`${idPrefix}${n}`);
            }}
            title={titles?.[n - 1] || `Lihat catatan ${n}`}
            className="font-medium text-accent-soft underline decoration-accent/45 underline-offset-2 transition-colors hover:text-heading"
          >
            {match[2]}
          </a>
        );
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}
