import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { buildBibliographyDocxBuffer } from "@/lib/docx-builder";
import { checkRateLimit } from "@/lib/rate-limit";

const exportSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Daftar Pustaka SmartSari"),
  format: z.enum(["apa", "ieee"]).default("apa"),
  items: z
    .array(
      z.object({
        citation: z.string().min(1).max(2000),
        note: z.string().max(2000).nullable().optional(),
      })
    )
    .min(1)
    .max(100),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit(request, "bookmarks_export_docx", 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan ekspor. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429 }
    );
  }

  let body: z.infer<typeof exportSchema>;
  try {
    body = exportSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Data daftar pustaka tidak valid." },
      { status: 400 }
    );
  }

  try {
    const buffer = await buildBibliographyDocxBuffer({
      title: body.title,
      formatLabel: body.format.toUpperCase(),
      items: body.items,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="daftar-pustaka-smartsari.docx"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("POST /api/bookmarks/export-docx error:", err);
    return NextResponse.json(
      { error: "Gagal membuat file Word daftar pustaka." },
      { status: 500 }
    );
  }
}
