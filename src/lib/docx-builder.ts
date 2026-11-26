import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import type { ConversionMode } from "@/lib/types";

const MODE_LABEL: Record<ConversionMode, string> = {
  clean: "Konversi Rapi Utuh",
  translate_id: "Terjemahan Bahasa Indonesia",
  summary_id: "Ringkasan & Review Akademik",
};

function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          size: 22,
          font: "Georgia",
        })
      );
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      runs.push(
        new TextRun({
          text: token.slice(2, -2),
          bold: true,
          size: 22,
          font: "Georgia",
        })
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          italics: true,
          size: 22,
          font: "Georgia",
        })
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          font: "Consolas",
          size: 20,
        })
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(
      new TextRun({
        text: text.slice(lastIndex),
        size: 22,
        font: "Georgia",
      })
    );
  }

  return runs.length > 0
    ? runs
    : [new TextRun({ text, size: 22, font: "Georgia" })];
}

export async function buildDocxBuffer(params: {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  mode: ConversionMode;
  model: string;
  markdownContent: string;
}): Promise<Buffer> {
  const children: Paragraph[] = [];

  // Header metadata banner
  children.push(
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: `SMARTSARI · ${MODE_LABEL[params.mode].toUpperCase()}`,
          bold: true,
          size: 18,
          color: "1B4D3E",
          font: "Calibri",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: params.title,
          bold: true,
          size: 32,
          color: "1C1917",
          font: "Georgia",
        }),
      ],
    })
  );

  const metaParts: string[] = [];
  if (params.authors.length > 0) metaParts.push(params.authors.join(", "));
  if (params.venue) metaParts.push(params.venue);
  if (params.year) metaParts.push(String(params.year));
  if (params.doi) metaParts.push(`DOI: ${params.doi}`);

  if (metaParts.length > 0) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        border: {
          bottom: {
            color: "D6CFC4",
            space: 8,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
        children: [
          new TextRun({
            text: metaParts.join("  •  "),
            italics: true,
            size: 20,
            color: "57534E",
            font: "Calibri",
          }),
        ],
      })
    );
  }

  // Parse Markdown lines into Word paragraphs
  const lines = params.markdownContent.replace(/\r\n/g, "\n").split("\n");
  let paragraphBuffer: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ").trim();
    paragraphBuffer = [];
    if (!text) return;
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 140, line: 276 },
        children: parseInlineRuns(text),
      })
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({
              text: line.slice(4).trim(),
              bold: true,
              size: 24,
              color: "1C1917",
              font: "Georgia",
            }),
          ],
        })
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 260, after: 100 },
          children: [
            new TextRun({
              text: line.slice(3).trim(),
              bold: true,
              size: 26,
              color: "1B4D3E",
              font: "Georgia",
            }),
          ],
        })
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({
              text: line.slice(2).trim(),
              bold: true,
              size: 28,
              color: "1C1917",
              font: "Georgia",
            }),
          ],
        })
      );
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80, line: 260 },
          children: parseInlineRuns(line.replace(/^[-*•]\s+/, "")),
        })
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      flushParagraph();
      children.push(
        new Paragraph({
          spacing: { after: 80, line: 260 },
          indent: { left: 360 },
          children: parseInlineRuns(line),
        })
      );
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      children.push(
        new Paragraph({
          indent: { left: 420 },
          spacing: { after: 120, line: 260 },
          children: [
            new TextRun({
              text: line.slice(2).trim(),
              italics: true,
              color: "57534E",
              size: 21,
              font: "Georgia",
            }),
          ],
        })
      );
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  const doc = new Document({
    creator: "SmartSari",
    title: params.title,
    description: `Dikonversi oleh SmartSari (${params.model})`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `SmartSari · ${params.model}  |  Halaman `,
                    size: 16,
                    color: "78716C",
                    font: "Calibri",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    color: "78716C",
                    font: "Calibri",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
