import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { clearAuthCookie } from "@/lib/auth";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  isAllowedAuthOrigin,
} from "@/lib/auth-security";
import { clearGuestSessionCookie, resolveSessionContext } from "@/lib/session";

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const rl = await checkAuthRateLimit(`auth_logout_all:${ipHash}`, 10, 900);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan. Tunggu ${Math.ceil(
          rl.retryAfterSeconds / 60
        )} menit.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const session = await resolveSessionContext(request);
  if (!session.userId) {
    return NextResponse.json(
      { error: "Anda belum masuk ke akun." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const db = getDb();
    await db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, session.userId));

    const res = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
    clearGuestSessionCookie(res);
    return clearAuthCookie(res);
  } catch (err) {
    console.error("POST /api/auth/logout-all error:", err);
    return NextResponse.json(
      { error: "Gagal mencabut semua sesi perangkat." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
