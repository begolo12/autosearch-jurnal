import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  attachAuthCookie,
  migrateGuestDataToUser,
  verifyPassword,
} from "@/lib/auth";
import {
  checkAuthRateLimit,
  DUMMY_PASSWORD_HASH,
  getAuthClientIpHash,
  hashEmailKey,
  isAllowedAuthOrigin,
} from "@/lib/auth-security";
import { clearGuestSessionCookie, getGuestSessionId } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  password: z.string().min(1, "Kata sandi wajib diisi.").max(72),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const ipRl = await checkAuthRateLimit(`auth_login_ip:${ipHash}`, 10, 900);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan login. Silakan tunggu ${Math.ceil(
          ipRl.retryAfterSeconds / 60
        )} menit.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(ipRl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data login tidak valid."
        : "Data login tidak valid.";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const emailRl = await checkAuthRateLimit(
    `auth_login_email:${hashEmailKey(body.email)}`,
    6,
    900
  );
  if (!emailRl.allowed) {
    return NextResponse.json(
      {
        error: `Akun sementara dikunci karena terlalu banyak percobaan. Tunggu ${Math.ceil(
          emailRl.retryAfterSeconds / 60
        )} menit.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(emailRl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    const user = rows[0];
    // Always run scrypt verify to prevent timing-based email enumeration
    const valid = verifyPassword(
      body.password,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH
    );

    if (!user || !valid) {
      return NextResponse.json(
        { error: "Email atau kata sandi salah." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const guestId = getGuestSessionId(request);
    if (guestId) {
      try {
        await migrateGuestDataToUser(guestId, `user:${user.id}`);
      } catch (migErr) {
        console.warn("Guest data migration on login failed:", migErr);
      }
    }

    const res = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
    clearGuestSessionCookie(res);
    return attachAuthCookie(res, user.id, user.tokenVersion);
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { error: "Gagal masuk ke akun." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
