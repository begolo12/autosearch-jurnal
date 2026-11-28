import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  verifyAuthTokenPayload,
} from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  if (!token) {
    return NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const payload = verifyAuthTokenPayload(token);
  if (!payload) {
    return clearAuthCookie(
      NextResponse.json(
        { user: null },
        { headers: { "Cache-Control": "no-store" } }
      )
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    const user = rows[0];
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      return clearAuthCookie(
        NextResponse.json(
          { user: null },
          { headers: { "Cache-Control": "no-store" } }
        )
      );
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    return NextResponse.json(
      { user: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
