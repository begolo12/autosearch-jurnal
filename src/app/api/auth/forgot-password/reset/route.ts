import crypto from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { passwordResetOtps, rateLimits, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
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
      { status: 403 }
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
      { status: 429, headers: { "Retry-After": String(ipRl.retryAfterSeconds) } }
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
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const pwdError = validateStrongPassword(body.newPassword);
  if (pwdError) {
    return NextResponse.json({ error: pwdError }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(passwordResetOtps)
      .where(eq(passwordResetOtps.email, body.email))
      .limit(1);

    const pending = rows[0];
    if (!pending) {
      return NextResponse.json(
        { error: "Kode OTP reset tidak ditemukan atau sudah kedaluwarsa." },
        { status: 400 }
      );
    }

    if (pending.expiresAt <= new Date()) {
      await db
        .delete(passwordResetOtps)
        .where(eq(passwordResetOtps.id, pending.id));
      return NextResponse.json(
        { error: "Kode OTP sudah kedaluwarsa. Silakan minta kode baru." },
        { status: 400 }
      );
    }

    if (pending.attempts >= 5) {
      await db
        .delete(passwordResetOtps)
        .where(eq(passwordResetOtps.id, pending.id));
      return NextResponse.json(
        { error: "Terlalu banyak percobaan OTP salah. Minta kode baru." },
        { status: 429 }
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
      const nextAttempts = pending.attempts + 1;
      if (nextAttempts >= 5) {
        await db
          .delete(passwordResetOtps)
          .where(eq(passwordResetOtps.id, pending.id));
        return NextResponse.json(
          { error: "Kode OTP salah 5 kali dan telah hangus. Minta kode baru." },
          { status: 429 }
        );
      }

      await db
        .update(passwordResetOtps)
        .set({ attempts: nextAttempts })
        .where(eq(passwordResetOtps.id, pending.id));

      return NextResponse.json(
        { error: `Kode OTP salah. Sisa percobaan: ${5 - nextAttempts} kali.` },
        { status: 400 }
      );
    }

    const updated = await db
      .update(users)
      .set({ passwordHash: hashPassword(body.newPassword) })
      .where(eq(users.email, body.email))
      .returning({ id: users.id });

    await db
      .delete(passwordResetOtps)
      .where(eq(passwordResetOtps.id, pending.id));

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Akun tidak ditemukan." },
        { status: 404 }
      );
    }

    // Clear any prior login brute-force lockout for this email
    await db
      .delete(rateLimits)
      .where(eq(rateLimits.key, `auth_login_email:${hashEmailKey(body.email)}`));

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("POST /api/auth/forgot-password/reset error:", err);
    return NextResponse.json(
      { error: "Gagal mengatur ulang kata sandi." },
      { status: 500 }
    );
  }
}
