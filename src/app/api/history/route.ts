import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { searchHistory } from "@/db/schema";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(searchHistory)
      .orderBy(desc(searchHistory.createdAt))
      .limit(15);
    return NextResponse.json({ history: rows });
  } catch (err) {
    console.error("GET /api/history error:", err);
    return NextResponse.json(
      { error: "Gagal memuat riwayat pencarian." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const db = getDb();
    await db.delete(searchHistory);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/history error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus riwayat pencarian." },
      { status: 500 }
    );
  }
}
