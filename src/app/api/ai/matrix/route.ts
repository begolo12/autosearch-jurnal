import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildLiteratureMatrixDocxBuffer } from "@/lib/docx-builder";
import { generateLiteratureMatrix, InferHubError } from "@/lib/inferhub";
import { checkRateLimit } from "@/lib/rate-limit";

const matrixRequestSchema = z.object({
  papers: z
    .array(
      z.object({
        title: z.string().min(1),
        authors: z.array(z.string()).default([]),
        year: z.number().nullable().optional(),
        venue: z.string().nullable().optional(),
        tierLabel: z.string().nullable().optional(),
        abstract: z.string().nullable().optional(),
      })
    )
    .min(2, "Pilih minimal 2 jurnal untuk membuat matriks.")
    .max(5, "Maksimal 5 jurnal per matriks literatur.")
    .optional(),
  exportDocx: z.boolean().optional(),
  matrix: z
    .object({
      synthesis: z.string(),
      researchGaps: z.string(),
      model: z.string(),
      rows: z.array(
        z.object({
          title: z.string(),
          authorsYear: z.string(),
          tier: z.string(),
          objective: z.string(),
          method: z.string(),
          sample: z.string(),
          findings: z.string(),
          limitations: z.string(),
        })
      ),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof matrixRequestSchema>;
  try {
    body = matrixRequestSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data jurnal tidak valid."
        : "Data jurnal tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (body.exportDocx && body.matrix) {
    try {
      const buffer = await buildLiteratureMatrixDocxBuffer(body.matrix);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="matriks-literatur-smartsari.docx"`,
        },
      });
    } catch (err) {
      console.error("POST /api/ai/matrix export error:", err);
      return NextResponse.json(
        { error: "Gagal mengekspor matriks ke Word." },
        { status: 500 }
      );
    }
  }

  if (!body.papers || body.papers.length < 2) {
    return NextResponse.json(
      { error: "Pilih minimal 2 jurnal untuk membuat matriks literatur." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_matrix", 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429 }
    );
  }

  try {
    const matrix = await generateLiteratureMatrix(
      body.papers.map((p) => ({
        title: p.title,
        authors: p.authors,
        year: p.year ?? null,
        venue: p.venue ?? null,
        tierLabel: p.tierLabel ?? null,
        abstract: p.abstract ?? null,
      }))
    );
    return NextResponse.json({ matrix });
  } catch (err) {
    if (err instanceof InferHubError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.code === "MISSING_API_KEY" ? 503 : 502 }
      );
    }
    console.error("POST /api/ai/matrix error:", err);
    return NextResponse.json(
      { error: "Gagal menyusun matriks literatur." },
      { status: 500 }
    );
  }
}
