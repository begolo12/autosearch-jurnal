import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatAboutPaper, InferHubError } from "@/lib/inferhub";
import { extractPdfText, fetchPdfBuffer } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";

const chatRequestSchema = z.object({
  paper: z.object({
    title: z.string().min(1),
    authors: z.array(z.string()).default([]),
    year: z.number().nullable().optional(),
    venue: z.string().nullable().optional(),
    abstract: z.string().nullable().optional(),
    pdfUrl: z.string().nullable().optional(),
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
  let body: z.infer<typeof chatRequestSchema>;
  try {
    body = chatRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Permintaan tanya-jawab jurnal tidak valid." },
      { status: 400 }
    );
  }

  const rl = await checkRateLimit(request, "ai_chat", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Batas tanya AI tercapai. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429 }
    );
  }

  let extractedText: string | null = null;
  if (body.paper.pdfUrl) {
    try {
      const pdfBuf = await fetchPdfBuffer(body.paper.pdfUrl);
      extractedText = await extractPdfText(pdfBuf);
    } catch {
      extractedText = null;
    }
  }

  try {
    const { reply, model } = await chatAboutPaper({
      title: body.paper.title,
      authors: body.paper.authors,
      year: body.paper.year ?? null,
      venue: body.paper.venue ?? null,
      abstract: body.paper.abstract ?? null,
      extractedText,
      messages: body.messages,
    });

    return NextResponse.json({
      reply,
      model,
      usedFullText: Boolean(extractedText),
    });
  } catch (err) {
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
