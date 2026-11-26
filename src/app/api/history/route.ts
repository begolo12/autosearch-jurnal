import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { searchHistory } from "@/db/schema";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.sessionId, sessionId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(15);
    return attachSessionCookie(
      NextResponse.json({ history: rows }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("GET /api/history error:", err);
    return NextResponse.json(
      { error: "Gagal memuat riwayat pencarian." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  try {
    const db = getDb();
    await db
      .delete(searchHistory)
      .where(eq(searchHistory.sessionId, sessionId));
    return attachSessionCookie(NextResponse.json({ ok: true }), sessionId, isNew);
  } catch (err) {
    console.error("DELETE /api/history error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus riwayat pencarian." },
      { status: 500 }
    );
  }
}
