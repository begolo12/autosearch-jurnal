import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import {
  generateWordMarkdown,
  InferHubError,
  translateAbstractToIndonesian,
} from "@/lib/inferhub";
import { extractPdfText, fetchPdfBuffer } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

export const maxDuration = 60;

const translateSchema = z.object({
  paperKey: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  year: z.number().nullable().optional(),
  venue: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  abstract: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  scope: z.enum(["full", "abstract"]).default("full"),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);

  let body: z.infer<typeof translateSchema>;
  try {
    body = translateSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Data permintaan terjemahan tidak valid." },
      { status: 400 }
    );
  }

  // Fast on-card abstract translation
  if (body.scope === "abstract") {
    if (!body.abstract) {
      return NextResponse.json(
        { error: "Abstrak tidak tersedia untuk diterjemahkan." },
        { status: 422 }
      );
    }

    const rl = await checkRateLimit(request, "translate_abstract", 20, 600);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: `Batas terjemahan tercapai. Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSeconds) },
        }
      );
    }

    try {
      const result = await translateAbstractToIndonesian({
        title: body.title,
        abstract: body.abstract,
        language: body.language,
      });
      return attachSessionCookie(NextResponse.json(result), sessionId, isNew);
    } catch (err) {
      if (err instanceof InferHubError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.code === "MISSING_API_KEY" ? 503 : err.status || 502 }
        );
      }
      return NextResponse.json(
        { error: "Gagal menerjemahkan abstrak." },
        { status: 500 }
      );
    }
  }

  // Full paper translation: check global Neon cache first
  const db = getDb();
  if (!body.force) {
    try {
      const existing = await db
        .select()
        .from(conversions)
        .where(
          and(
            eq(conversions.paperKey, body.paperKey),
            eq(conversions.mode, "translate_id")
          )
        )
        .orderBy(desc(conversions.createdAt))
        .limit(1);

      if (existing.length > 0) {
        return attachSessionCookie(
          NextResponse.json({
            markdown: existing[0].markdownContent,
            model: existing[0].model,
            cached: true,
            sourceType: existing[0].pdfUrl ? "pdf" : "abstract",
            conversionId: existing[0].id,
          }),
          sessionId,
          isNew
        );
      }
    } catch (err) {
      console.warn("Translate cache lookup failed:", err);
    }
  }

  // Rate limit only on cache miss
  const rl = await checkRateLimit(request, "translate_full", 10, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Batas terjemahan AI tercapai (maks 10 per 10 menit). Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
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
      const pdfBuffer = await fetchPdfBuffer(body.pdfUrl);
      extractedText = await extractPdfText(pdfBuffer);
    } catch (err) {
      console.warn("Translate PDF extraction fallback:", err);
    }
  }

  if (!extractedText && !body.abstract) {
    return NextResponse.json(
      {
        error:
          "PDF tidak dapat diakses langsung dan abstrak tidak tersedia untuk diterjemahkan.",
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
      mode: "translate_id",
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
          mode: "translate_id",
          pdfUrl: body.pdfUrl ?? null,
          model,
          markdownContent: markdown,
        })
        .returning({ id: conversions.id });
      conversionId = inserted?.id ?? "";
    } catch (dbErr) {
      console.warn("Failed to cache translation:", dbErr);
    }

    return attachSessionCookie(
      NextResponse.json({
        markdown,
        model,
        cached: false,
        sourceType: extractedText ? "pdf" : "abstract",
        conversionId,
      }),
      sessionId,
      isNew
    );
  } catch (err) {
    if (err instanceof InferHubError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === "MISSING_API_KEY" ? 503 : err.status || 502 }
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan saat menerjemahkan jurnal." },
      { status: 500 }
    );
  }
}
