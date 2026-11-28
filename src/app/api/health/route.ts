import { sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { getDb } from "@/db";

const HEALTH_CACHE_TTL_MS = 5000;
let cachedHealth: { ok: boolean; expiresAt: number } | null = null;

export async function GET() {
  await connection();
  const timestamp = new Date().toISOString();
  const now = Date.now();

  if (cachedHealth && now < cachedHealth.expiresAt) {
    return NextResponse.json(
      {
        ok: cachedHealth.ok,
        status: cachedHealth.ok ? "healthy" : "degraded",
        timestamp,
      },
      {
        status: cachedHealth.ok ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    cachedHealth = { ok: true, expiresAt: now + HEALTH_CACHE_TTL_MS };
    return NextResponse.json(
      { ok: true, status: "healthy", timestamp },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[SmartSari] Health check failed:", err);
    cachedHealth = { ok: false, expiresAt: now + HEALTH_CACHE_TTL_MS };
    return NextResponse.json(
      { ok: false, status: "degraded", timestamp },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
