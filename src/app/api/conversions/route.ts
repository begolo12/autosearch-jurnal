import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { sessionId, isNew, clearStaleAuth } =
    await resolveSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: conversions.id,
        paperKey: conversions.paperKey,
        title: conversions.title,
        authors: conversions.authors,
        year: conversions.year,
        mode: conversions.mode,
        pdfUrl: conversions.pdfUrl,
        markdownContent: conversions.markdownContent,
        createdAt: conversions.createdAt,
      })
      .from(conversions)
      .where(eq(conversions.sessionId, sessionId))
      .orderBy(desc(conversions.createdAt))
      .limit(30);
    return attachSessionCookie(
      NextResponse.json(
        { conversions: rows },
        { headers: { "Cache-Control": "no-store" } }
      ),
      sessionId,
      isNew,
      clearStaleAuth
    );
  } catch (err) {
    console.error("GET /api/conversions error:", err);
    return NextResponse.json(
      { error: "Gagal memuat riwayat konversi Word." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
