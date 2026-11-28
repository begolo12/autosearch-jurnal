import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { buildDocxBuffer } from "@/lib/docx-builder";
import { sanitizeFilename } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";
import type { ConversionMode } from "@/lib/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const rl = await checkRateLimit(request, "conversions_download", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan unduhan. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { sessionId, isNew, clearStaleAuth } =
    await resolveSessionContext(request);
  const { id } = await context.params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        title: conversions.title,
        authors: conversions.authors,
        year: conversions.year,
        mode: conversions.mode,
        markdownContent: conversions.markdownContent,
      })
      .from(conversions)
      .where(and(eq(conversions.id, id), eq(conversions.sessionId, sessionId)))
      .limit(1);

    if (rows.length === 0) {
      return attachSessionCookie(
        NextResponse.json(
          { error: "Riwayat konversi tidak ditemukan." },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        ),
        sessionId,
        isNew,
        clearStaleAuth
      );
    }

    const record = rows[0];
    const docxBuffer = await buildDocxBuffer({
      title: record.title,
      authors: record.authors ?? [],
      year: record.year,
      venue: null,
      doi: null,
      mode: (record.mode as ConversionMode) || "clean",
      markdownContent: record.markdownContent,
    });

    const filename = sanitizeFilename(`${record.title}-${record.mode}`, "docx");
    const res = new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
    return attachSessionCookie(res, sessionId, isNew, clearStaleAuth);
  } catch (err) {
    console.error("GET /api/conversions/[id]/download error:", err);
    return NextResponse.json(
      { error: "Gagal membuat ulang berkas Word." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
