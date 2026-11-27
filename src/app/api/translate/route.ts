import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import {
  generateWordMarkdown,
  InferHubError,
  translateAbstractToIndonesian,
} from "@/lib/inferhub";
import {
  extractPdfText,
  fetchEuropePmcFullText,
  fetchPdfWithFallbacks,
} from "@/lib/pdf";
import { checkDailyAiQuota } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

export const maxDuration = 60;

const translateSchema = z.object({
  paperKey: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  authors: z.array(z.string().max(160)).max(50).default([]),
  year: z.number().nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
  doi: z.string().max(200).nullable().optional(),
  abstract: z.string().max(15000).nullable().optional(),
  pdfUrl: z.string().max(1000).nullable().optional(),
  language: z.string().max(40).nullable().optional(),
  scope: z.enum(["full", "abstract"]).default("full"),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

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

    const rl = await checkRateLimit(request, "translate_abstract", 20, 600, true);
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
      const result = await translateAbstractToIndonesian({
        title: body.title,
        abstract: body.abstract,
        language: body.language,
      });
      return attachSessionCookie(NextResponse.json(result), sessionId, isNew);
    } catch (err) {
      if (err instanceof InferHubError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.code === "MISSING_API_KEY" ? 503 : err.status || 502 }
        );
      }
      return NextResponse.json(
        { error: "Gagal menerjemahkan abstrak." },
        { status: 500 }
      );
    }
  }

  // Full paper translation: check session-scoped Neon cache first
  const db = getDb();
  if (!body.force) {
    try {
      const existing = await db
        .select()
        .from(conversions)
        .where(
          and(
            eq(conversions.sessionId, sessionId),
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

  // Rate limit only on cache miss (fail-closed)
  const rl = await checkRateLimit(request, "translate_full", 10, 600, true);
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

  let extractedText: string | null = null;
  if (body.pdfUrl) {
    try {
      const pdfBuffer = await fetchPdfWithFallbacks(body.pdfUrl, body.doi);
      extractedText = await extractPdfText(pdfBuffer);
    } catch (err) {
      console.warn("Translate PDF extraction fallback:", err);
      extractedText = await fetchEuropePmcFullText(body.pdfUrl);
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
    const { markdown } = await generateWordMarkdown({
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
          model: "smartsari-engine",
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
        { error: err.message },
        { status: err.code === "MISSING_API_KEY" ? 503 : err.status || 502 }
      );
    }

    return NextResponse.json(
      { error: "Terjadi kesalahan saat menerjemahkan jurnal." },
      { status: 500 }
    );
  }
}
