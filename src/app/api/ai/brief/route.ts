import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { generateSearchResearchBrief, InferHubError } from "@/lib/inferhub";
import { checkDailyAiQuota } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie } from "@/lib/session";

export const maxDuration = 60;

const briefSchema = z.object({
  query: z.string().trim().min(2).max(200),
  papers: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        authors: z.array(z.string().max(160)).max(50).default([]),
        year: z.number().int().min(1800).max(2100).nullable().optional(),
        venue: z.string().max(300).nullable().optional(),
        tierLabel: z.string().max(40).nullable().optional(),
        abstract: z.string().max(8000).nullable().optional(),
        citations: z.number().int().min(0).max(10_000_000).nullable().optional(),
      })
    )
    .min(1)
    .max(10),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  let body: z.infer<typeof briefSchema>;
  try {
    body = briefSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Data ringkasan riset tidak valid." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_brief", 15, 600, true);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan ringkasan AI. Tunggu ${rl.retryAfterSeconds} detik.`,
      },
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
    const brief = await generateSearchResearchBrief({
      query: body.query,
      papers: body.papers.map((p) => ({
        title: p.title,
        authors: p.authors,
        year: p.year ?? null,
        venue: p.venue ?? null,
        tierLabel: p.tierLabel ?? null,
        abstract: p.abstract ?? null,
        citations: p.citations ?? null,
      })),
    });

    return attachSessionCookie(
      NextResponse.json({ brief }),
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
    console.error("POST /api/ai/brief error:", err);
    return NextResponse.json(
      { error: "Gagal menyusun ringkasan riset AI." },
      { status: 500 }
    );
  }
}
