import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { buildDocxBuffer } from "@/lib/docx-builder";
import { generateWordMarkdown, InferHubError } from "@/lib/inferhub";
import {
  extractPdfText,
  fetchEuropePmcFullText,
  fetchPdfWithFallbacks,
  sanitizeFilename,
} from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, getSessionContext } from "@/lib/session";
import type { ConversionMode } from "@/lib/types";

export const maxDuration = 60;

const convertSchema = z.object({
  paperKey: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  year: z.number().nullable().optional(),
  venue: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  abstract: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  mode: z.enum(["clean", "translate_id", "summary_id"]).default("clean"),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);

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

  // Check global Neon cache first
  if (!body.force) {
    try {
      const existing = await db
        .select()
        .from(conversions)
        .where(
          and(
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
          model: record.model,
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
          },
        });
        return attachSessionCookie(res, sessionId, isNew);
      }
    } catch (err) {
      console.warn("Conversion cache lookup failed:", err);
    }
  }

  // Rate limit only on cache miss
  const rl = await checkRateLimit(request, "convert_word", 10, 600);
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
    return NextResponse.json(
      {
        error:
          "PDF tidak dapat diakses langsung dan abstrak tidak tersedia untuk dikonversi.",
      },
      { status: 422 }
    );
  }

  try {
    const { markdown, model } = await generateWordMarkdown({
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
          model,
          markdownContent: markdown,
        })
        .returning({ id: conversions.id });
      conversionId = inserted?.id ?? "";
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
      model,
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
      },
    });
    return attachSessionCookie(res, sessionId, isNew);
  } catch (err) {
    if (err instanceof InferHubError) {
      const status = err.code === "MISSING_API_KEY" ? 503 : err.status || 502;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status }
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan saat mengonversi jurnal ke Word." },
      { status: 500 }
    );
  }
}
