import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractPaperTakeaways, InferHubError } from "@/lib/inferhub";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const takeawaysSchema = z.object({
  title: z.string().trim().min(1).max(400),
  abstract: z.string().trim().min(20).max(8000),
  venue: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof takeawaysSchema>;
  try {
    body = takeawaysSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Abstrak tidak cukup lengkap untuk diringkas." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_takeaways", 25, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Batas intisari AI tercapai. Tunggu ${rl.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

  try {
    const takeaways = await extractPaperTakeaways({
      title: body.title,
      abstract: body.abstract,
      venue: body.venue ?? null,
      year: body.year ?? null,
    });

    return NextResponse.json({ takeaways });
  } catch (err) {
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
