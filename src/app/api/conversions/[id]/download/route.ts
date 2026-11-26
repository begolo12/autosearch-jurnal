import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { buildDocxBuffer } from "@/lib/docx-builder";
import { sanitizeFilename } from "@/lib/pdf";
import type { ConversionMode } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversions)
      .where(eq(conversions.id, id))
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
      model: record.model,
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
