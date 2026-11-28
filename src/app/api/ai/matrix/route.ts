import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { buildLiteratureMatrixDocxBuffer } from "@/lib/docx-builder";
import { generateLiteratureMatrix, InferHubError } from "@/lib/inferhub";
import { checkDailyAiQuota } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie } from "@/lib/session";

export const maxDuration = 60;

const matrixRequestSchema = z.object({
  papers: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        authors: z.array(z.string().max(160)).max(50).default([]),
        year: z.number().int().min(1800).max(2100).nullable().optional(),
        venue: z.string().max(300).nullable().optional(),
        tierLabel: z.string().max(40).nullable().optional(),
        abstract: z.string().max(15000).nullable().optional(),
      })
    )
    .min(2, "Pilih minimal 2 jurnal untuk membuat matriks.")
    .max(5, "Maksimal 5 jurnal per matriks literatur.")
    .optional(),
  exportDocx: z.boolean().optional(),
  matrix: z
    .object({
      synthesis: z.string().max(10000),
      researchGaps: z.string().max(10000),
      rows: z
        .array(
          z.object({
            title: z.string().max(500),
            authorsYear: z.string().max(300),
            tier: z.string().max(60),
            objective: z.string().max(3000),
            method: z.string().max(3000),
            sample: z.string().max(3000),
            findings: z.string().max(3000),
            limitations: z.string().max(3000),
          })
        )
        .max(10),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

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
    const exportRl = await checkRateLimit(request, "ai_matrix_export", 20, 60, true);
    if (!exportRl.allowed) {
      return NextResponse.json(
        {
          error: `Terlalu banyak permintaan ekspor. Tunggu ${exportRl.retryAfterSeconds} detik.`,
        },
        { status: 429, headers: { "Retry-After": String(exportRl.retryAfterSeconds) } }
      );
    }

    try {
      const buffer = await buildLiteratureMatrixDocxBuffer(body.matrix);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="matriks-literatur-smartsari.docx"`,
          "X-Content-Type-Options": "nosniff",
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

  const rl = await checkRateLimit(request, "ai_matrix", 10, 60, true);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const quota = await checkDailyAiQuota(request);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: quota.error, requireLogin: quota.requireLogin },
      {
        status: quota.status,
        headers: { "Retry-After": String(quota.retryAfterSeconds) },
      }
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
    return attachSessionCookie(
      NextResponse.json({ matrix }),
      quota.session.sessionId,
      quota.session.isNew,
      quota.session.clearStaleAuth
    );
  } catch (err) {
    await quota.refund();
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
