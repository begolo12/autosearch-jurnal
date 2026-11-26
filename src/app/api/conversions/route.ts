import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversions)
      .where(eq(conversions.sessionId, sessionId))
      .orderBy(desc(conversions.createdAt))
      .limit(30);
    return attachSessionCookie(
      NextResponse.json({ conversions: rows }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("GET /api/conversions error:", err);
    return NextResponse.json(
      { error: "Gagal memuat riwayat konversi Word." },
      { status: 500 }
    );
  }
}
