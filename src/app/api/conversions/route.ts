import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(conversions)
      .orderBy(desc(conversions.createdAt))
      .limit(30);
    return NextResponse.json({ conversions: rows });
  } catch (err) {
    console.error("GET /api/conversions error:", err);
    return NextResponse.json(
      { error: "Gagal memuat riwayat konversi Word." },
      { status: 500 }
    );
  }
}
