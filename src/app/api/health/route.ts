import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { getDb } from "@/db";

export async function GET() {
  await connection();
  const timestamp = new Date().toISOString();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      { ok: true, status: "healthy", timestamp },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[SmartSari] Health check failed:", err);
    return NextResponse.json(
      { ok: false, status: "degraded", timestamp },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
