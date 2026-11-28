import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { buildDocxBuffer } from "@/lib/docx-builder";
import { generateWordMarkdown, InferHubError } from "@/lib/inferhub";
import {
  extractPdfText,
  fetchEuropePmcFullText,
  fetchPdfWithFallbacks,
  sanitizeFilename,
} from "@/lib/pdf";
import { checkDailyAiQuota } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";
import type { ConversionMode } from "@/lib/types";

export const maxDuration = 60;

const MAX_CONVERSIONS_PER_SESSION = 50;

const convertSchema = z.object({
  paperKey: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  authors: z.array(z.string().max(160)).max(50).default([]),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
  doi: z.string().max(200).nullable().optional(),
  abstract: z.string().max(15000).nullable().optional(),
  pdfUrl: z.string().max(1000).nullable().optional(),
  mode: z.enum(["clean", "translate_id", "summary_id"]).default("clean"),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  const session = await resolveSessionContext(request);
  const { sessionId, isNew, clearStaleAuth } = session;

  let body: z.infer<typeof convertSchema>;
  try {
    const raw = await request.json();
    body = convertSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Payload permintaan konversi tidak valid." },
      { status: 400 }
    );
  }

  const mode: ConversionMode = body.mode;
  const db = getDb();

  // Check session-scoped Neon cache first
  if (!body.force) {
    try {
      const existing = await db
        .select()
        .from(conversions)
        .where(
          and(
            eq(conversions.sessionId, sessionId),
            eq(conversions.paperKey, body.paperKey),
            eq(conversions.mode, mode)
          )
        )
        .orderBy(desc(conversions.createdAt))
        .limit(1);

      if (existing.length > 0) {
        const record = existing[0];
        const docxBuffer = await buildDocxBuffer({
          title: record.title,
          authors: record.authors ?? body.authors,
          year: record.year ?? body.year ?? null,
          venue: body.venue ?? null,
          doi: body.doi ?? null,
          mode,
          markdownContent: record.markdownContent,
        });

        const filename = sanitizeFilename(`${body.title}-${mode}`, "docx");
        const res = new NextResponse(new Uint8Array(docxBuffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "X-Conversion-Id": record.id,
            "X-Cached": "true",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
        return attachSessionCookie(res, sessionId, isNew, clearStaleAuth);
      }
    } catch (err) {
      console.warn("Conversion cache lookup failed:", err);
    }
  }

  // Rate limit only on cache miss (fail-closed)
  const rl = await checkRateLimit(request, "convert_word", 10, 600, true);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Batas konversi AI tercapai (maks 10 per 10 menit). Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // Validate content availability before consuming daily AI quota
  let extractedText: string | null = null;
  if (body.pdfUrl) {
    try {
      const pdfBuffer = await fetchPdfWithFallbacks(body.pdfUrl, body.doi);
      extractedText = await extractPdfText(pdfBuffer);
    } catch (err) {
      console.warn("PDF text extraction fallback to Europe PMC XML / abstract:", err);
      extractedText = await fetchEuropePmcFullText(body.pdfUrl);
    }
  }

  if (!extractedText && !body.abstract) {
    return attachSessionCookie(
      NextResponse.json(
        {
          error:
            "PDF tidak dapat diakses langsung dan abstrak tidak tersedia untuk dikonversi.",
        },
        { status: 422 }
      ),
      sessionId,
      isNew,
      clearStaleAuth
    );
  }

  const quota = await checkDailyAiQuota(request, session);
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
    const { markdown } = await generateWordMarkdown({
      title: body.title,
      authors: body.authors,
      year: body.year ?? null,
      venue: body.venue ?? null,
      doi: body.doi ?? null,
      abstract: body.abstract ?? null,
      extractedText,
      mode,
    });

    let conversionId = "";
    try {
      const [inserted] = await db
        .insert(conversions)
        .values({
          sessionId,
          paperKey: body.paperKey,
          title: body.title,
          authors: body.authors,
          year: body.year ?? null,
          mode,
          pdfUrl: body.pdfUrl ?? null,
          model: "smartsari-engine",
          markdownContent: markdown,
        })
        .returning({ id: conversions.id });
      conversionId = inserted?.id ?? "";

      const overflow = await db
        .select({ id: conversions.id })
        .from(conversions)
        .where(eq(conversions.sessionId, sessionId))
        .orderBy(desc(conversions.createdAt))
        .offset(MAX_CONVERSIONS_PER_SESSION);
      if (overflow.length > 0) {
        await db
          .delete(conversions)
          .where(inArray(conversions.id, overflow.map((r) => r.id)));
      }
    } catch (dbErr) {
      console.warn("Failed to save conversion to Neon:", dbErr);
    }

    const docxBuffer = await buildDocxBuffer({
      title: body.title,
      authors: body.authors,
      year: body.year ?? null,
      venue: body.venue ?? null,
      doi: body.doi ?? null,
      mode,
      markdownContent: markdown,
    });

    const filename = sanitizeFilename(`${body.title}-${mode}`, "docx");
    const res = new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Conversion-Id": conversionId,
        "X-Cached": "false",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
    return attachSessionCookie(res, sessionId, isNew, clearStaleAuth);
  } catch (err) {
    await quota.refund();
    if (err instanceof InferHubError) {
      const status = err.code === "MISSING_API_KEY" ? 503 : err.status || 502;
      return NextResponse.json({ error: err.message }, { status });
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan saat mengonversi jurnal ke Word." },
      { status: 500 }
    );
  }
}
