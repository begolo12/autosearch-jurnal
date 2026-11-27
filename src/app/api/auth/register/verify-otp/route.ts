import crypto from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { emailOtpChallenges, users } from "@/db/schema";
import { attachAuthCookie, migrateGuestDataToUser } from "@/lib/auth";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  isAllowedAuthOrigin,
} from "@/lib/auth-security";
import { hashOtp } from "@/lib/email";
import { getGuestSessionId } from "@/lib/session";

const verifyOtpSchema = z.object({
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Kode OTP harus terdiri dari 6 digit angka."),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const ipRl = await checkAuthRateLimit(`auth_verify_otp_ip:${ipHash}`, 15, 900);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan verifikasi OTP. Tunggu ${Math.ceil(
          ipRl.retryAfterSeconds / 60
        )} menit.`,
      },
      { status: 429, headers: { "Retry-After": String(ipRl.retryAfterSeconds) } }
    );
  }

  let body: z.infer<typeof verifyOtpSchema>;
  try {
    body = verifyOtpSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Kode OTP tidak valid."
        : "Kode OTP tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(emailOtpChallenges)
      .where(eq(emailOtpChallenges.email, body.email))
      .limit(1);

    const pending = rows[0];
    if (!pending) {
      return NextResponse.json(
        { error: "Kode OTP tidak ditemukan atau sudah kedaluwarsa. Minta kode baru." },
        { status: 400 }
      );
    }

    if (pending.expiresAt <= new Date()) {
      await db
        .delete(emailOtpChallenges)
        .where(eq(emailOtpChallenges.id, pending.id));
      return NextResponse.json(
        { error: "Kode OTP sudah kedaluwarsa. Silakan minta kode baru." },
        { status: 400 }
      );
    }

    if (pending.attempts >= 5) {
      await db
        .delete(emailOtpChallenges)
        .where(eq(emailOtpChallenges.id, pending.id));
      return NextResponse.json(
        { error: "Terlalu banyak percobaan OTP salah. Silakan ulangi pendaftaran." },
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
          .delete(emailOtpChallenges)
          .where(eq(emailOtpChallenges.id, pending.id));
        return NextResponse.json(
          { error: "Kode OTP salah 5 kali dan telah hangus. Silakan ulangi pendaftaran." },
          { status: 429 }
        );
      }

      await db
        .update(emailOtpChallenges)
        .set({ attempts: nextAttempts })
        .where(eq(emailOtpChallenges.id, pending.id));

      return NextResponse.json(
        { error: `Kode OTP salah. Sisa percobaan: ${5 - nextAttempts} kali.` },
        { status: 400 }
      );
    }

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existingUser.length > 0) {
      await db
        .delete(emailOtpChallenges)
        .where(eq(emailOtpChallenges.id, pending.id));
      return NextResponse.json(
        { error: "Email ini sudah terdaftar. Silakan masuk." },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        name: pending.name,
        email: pending.email,
        passwordHash: pending.passwordHash,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    await db
      .delete(emailOtpChallenges)
      .where(eq(emailOtpChallenges.id, pending.id));

    const guestId = getGuestSessionId(request);
    if (guestId) {
      try {
        await migrateGuestDataToUser(guestId, `user:${created.id}`);
      } catch (migErr) {
        console.warn("Guest data migration on verify-otp failed:", migErr);
      }
    }

    return attachAuthCookie(
      NextResponse.json(
        { user: created },
        { status: 201, headers: { "Cache-Control": "no-store" } }
      ),
      created.id
    );
  } catch (err) {
    console.error("POST /api/auth/register/verify-otp error:", err);
    return NextResponse.json(
      { error: "Gagal memverifikasi kode OTP." },
      { status: 500 }
    );
  }
}
