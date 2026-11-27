import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { buildDocxBuffer } from "@/lib/docx-builder";
import { sanitizeFilename } from "@/lib/pdf";
import { getSessionContext } from "@/lib/session";
import type { ConversionMode } from "@/lib/types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { sessionId } = getSessionContext(request);
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
      return NextResponse.json(
        { error: "Riwayat konversi tidak ditemukan." },
        { status: 404 }
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
    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("GET /api/conversions/[id]/download error:", err);
    return NextResponse.json(
      { error: "Gagal membuat ulang berkas Word." },
      { status: 500 }
    );
  }
}
