import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateSearchResearchBrief, InferHubError } from "@/lib/inferhub";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const briefSchema = z.object({
  query: z.string().trim().min(2).max(200),
  papers: z
    .array(
      z.object({
        title: z.string().min(1),
        authors: z.array(z.string()).default([]),
        year: z.number().nullable().optional(),
        venue: z.string().nullable().optional(),
        tierLabel: z.string().nullable().optional(),
        abstract: z.string().nullable().optional(),
        citations: z.number().nullable().optional(),
      })
    )
    .min(1)
    .max(10),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof briefSchema>;
  try {
    body = briefSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Data ringkasan riset tidak valid." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_brief", 15, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan ringkasan AI. Tunggu ${rl.retryAfterSeconds} detik.`,
      },
      { status: 429 }
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

    return NextResponse.json({ brief });
  } catch (err) {
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
