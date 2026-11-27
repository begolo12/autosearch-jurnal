import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { searchHistory } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  const filterQ = (request.nextUrl.searchParams.get("q") || "")
    .trim()
    .toLowerCase();

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: searchHistory.id,
        query: searchHistory.query,
        filters: searchHistory.filters,
        resultCount: searchHistory.resultCount,
        createdAt: searchHistory.createdAt,
      })
      .from(searchHistory)
      .where(eq(searchHistory.sessionId, sessionId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(60);

    // Deduplicate by normalized lowercase query, keeping newest entry
    const seen = new Set<string>();
    const unique: typeof rows = [];
    for (const row of rows) {
      const norm = row.query.toLowerCase().replace(/\s+/g, " ").trim();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      if (filterQ && !norm.includes(filterQ)) continue;
      unique.push(row);
      if (unique.length >= 30) break;
    }

    return attachSessionCookie(
      NextResponse.json({ history: unique }),
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
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }
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
