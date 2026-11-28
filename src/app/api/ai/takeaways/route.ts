import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { extractPaperTakeaways, InferHubError } from "@/lib/inferhub";
import { checkDailyAiQuota } from "@/lib/quota";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie } from "@/lib/session";

export const maxDuration = 60;

const takeawaysSchema = z.object({
  title: z.string().trim().min(1).max(400),
  abstract: z.string().trim().min(20).max(8000),
  venue: z.string().max(300).nullable().optional(),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  let body: z.infer<typeof takeawaysSchema>;
  try {
    body = takeawaysSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Abstrak tidak cukup lengkap untuk diringkas." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_takeaways", 25, 600, true);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Batas intisari AI tercapai. Tunggu ${rl.retryAfterSeconds} detik.`,
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
    const takeaways = await extractPaperTakeaways({
      title: body.title,
      abstract: body.abstract,
      venue: body.venue ?? null,
      year: body.year ?? null,
    });

    return attachSessionCookie(
      NextResponse.json({ takeaways }),
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
    console.error("POST /api/ai/takeaways error:", err);
    return NextResponse.json(
      { error: "Gagal mengekstrak intisari jurnal." },
      { status: 500 }
    );
  }
}
