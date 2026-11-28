import crypto from "crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { passwordResetOtps, rateLimits, users } from "@/db/schema";
import { clearAuthCookie, hashPassword } from "@/lib/auth";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  hashEmailKey,
  isAllowedAuthOrigin,
  validateStrongPassword,
} from "@/lib/auth-security";
import { hashOtp } from "@/lib/email";

const resetSchema = z.object({
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Kode OTP harus terdiri dari 6 digit angka."),
  newPassword: z.string().min(8, "Kata sandi minimal 8 karakter.").max(72),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const ipRl = await checkAuthRateLimit(`auth_reset_ip:${ipHash}`, 15, 900);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan reset. Tunggu ${Math.ceil(
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

  let body: z.infer<typeof resetSchema>;
  try {
    body = resetSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data reset kata sandi tidak valid."
        : "Data reset kata sandi tidak valid.";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const pwdError = validateStrongPassword(body.newPassword);
  if (pwdError) {
    return NextResponse.json(
      { error: pwdError },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const db = getDb();
    const now = new Date();

    // Atomic attempt increment prevents concurrent OTP brute-force bypass
    const [pending] = await db
      .update(passwordResetOtps)
      .set({ attempts: sql`${passwordResetOtps.attempts} + 1` })
      .where(
        and(
          eq(passwordResetOtps.email, body.email),
          lt(passwordResetOtps.attempts, 5),
          gt(passwordResetOtps.expiresAt, now)
        )
      )
      .returning();

    if (!pending) {
      const existing = await db
        .select({
          id: passwordResetOtps.id,
          attempts: passwordResetOtps.attempts,
          expiresAt: passwordResetOtps.expiresAt,
        })
        .from(passwordResetOtps)
        .where(eq(passwordResetOtps.email, body.email))
        .limit(1);

      const stale = existing[0];
      if (stale) {
        await db
          .delete(passwordResetOtps)
          .where(eq(passwordResetOtps.id, stale.id));

        if (stale.attempts >= 5) {
          return NextResponse.json(
            { error: "Terlalu banyak percobaan OTP salah. Minta kode baru." },
            { status: 429, headers: { "Cache-Control": "no-store" } }
          );
        }
        return NextResponse.json(
          { error: "Kode OTP sudah kedaluwarsa. Silakan minta kode baru." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        { error: "Kode OTP reset tidak ditemukan atau sudah kedaluwarsa." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const candidateHash = hashOtp(
      body.otp,
      body.email,
      pending.expiresAt.getTime()
    );
    let matches = false;
    try {
      const a = Buffer.from(candidateHash, "hex");
      const b = Buffer.from(pending.otpHash, "hex");
      matches = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      matches = false;
    }

    if (!matches) {
      if (pending.attempts >= 5) {
        await db
          .delete(passwordResetOtps)
          .where(eq(passwordResetOtps.id, pending.id));
        return NextResponse.json(
          { error: "Kode OTP salah 5 kali dan telah hangus. Minta kode baru." },
          { status: 429, headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        { error: `Kode OTP salah. Sisa percobaan: ${5 - pending.attempts} kali.` },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Atomically consume OTP before resetting password
    const consumed = await db
      .delete(passwordResetOtps)
      .where(eq(passwordResetOtps.id, pending.id))
      .returning({ id: passwordResetOtps.id });

    if (consumed.length === 0) {
      return NextResponse.json(
        { error: "Kode OTP reset sudah digunakan." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Bump tokenVersion to immediately revoke all previously issued auth cookies
    const updated = await db
      .update(users)
      .set({
        passwordHash: hashPassword(body.newPassword),
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.email, body.email))
      .returning({ id: users.id });

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Akun tidak ditemukan." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Clear any prior login brute-force lockout for this email
    await db
      .delete(rateLimits)
      .where(eq(rateLimits.key, `auth_login_email:${hashEmailKey(body.email)}`));

    return clearAuthCookie(
      NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
    );
  } catch (err) {
    console.error("POST /api/auth/forgot-password/reset error:", err);
    return NextResponse.json(
      { error: "Gagal mengatur ulang kata sandi." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
