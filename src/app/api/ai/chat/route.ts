import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { chatAboutPaper, InferHubError } from "@/lib/inferhub";
import {
  extractPdfText,
  fetchEuropePmcFullText,
  fetchPdfWithFallbacks,
} from "@/lib/pdf";
import { checkDailyAiQuota } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie } from "@/lib/session";

export const maxDuration = 60;

const chatRequestSchema = z.object({
  paper: z.object({
    title: z.string().min(1).max(500),
    authors: z.array(z.string().max(160)).max(50).default([]),
    year: z.number().int().min(1800).max(2100).nullable().optional(),
    venue: z.string().max(300).nullable().optional(),
    doi: z.string().max(200).nullable().optional(),
    abstract: z.string().max(15000).nullable().optional(),
    pdfUrl: z.string().max(1000).nullable().optional(),
  }),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(12),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  let body: z.infer<typeof chatRequestSchema>;
  try {
    body = chatRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Permintaan tanya-jawab jurnal tidak valid." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_chat", 20, 60, true);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Batas tanya AI tercapai. Tunggu ${rl.retryAfterSeconds} detik.` },
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

  let extractedText: string | null = null;
  if (body.paper.pdfUrl) {
    try {
      const pdfBuf = await fetchPdfWithFallbacks(
        body.paper.pdfUrl,
        body.paper.doi
      );
      extractedText = await extractPdfText(pdfBuf);
    } catch {
      extractedText = await fetchEuropePmcFullText(body.paper.pdfUrl);
    }
  }

  try {
    const { reply } = await chatAboutPaper({
      title: body.paper.title,
      authors: body.paper.authors,
      year: body.paper.year ?? null,
      venue: body.paper.venue ?? null,
      abstract: body.paper.abstract ?? null,
      extractedText,
      messages: body.messages,
    });

    return attachSessionCookie(
      NextResponse.json({
        reply,
        usedFullText: Boolean(extractedText),
      }),
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
    console.error("POST /api/ai/chat error:", err);
    return NextResponse.json(
      { error: "Gagal menjawab pertanyaan tentang jurnal." },
      { status: 500 }
    );
  }
}
