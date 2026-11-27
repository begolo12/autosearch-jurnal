import crypto from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { passwordResetOtps, users } from "@/db/schema";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  hashEmailKey,
  isAllowedAuthOrigin,
  verifyAndConsumeHumanChallenge,
} from "@/lib/auth-security";
import { hashOtp, sendPasswordResetOtpEmail } from "@/lib/email";

const forgotRequestSchema = z.object({
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  website: z.string().max(200).optional(),
  challengeToken: z.string().min(10, "Verifikasi keamanan wajib diisi.").max(512),
  challengeAnswer: z.string().trim().min(1, "Jawaban verifikasi wajib diisi.").max(16),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const [globalRl, ipRl] = await Promise.all([
    checkAuthRateLimit("auth_forgot_global", 30, 600),
    checkAuthRateLimit(`auth_forgot_ip:${ipHash}`, 5, 900),
  ]);

  if (!globalRl.allowed || !ipRl.allowed) {
    const retryAfter = Math.max(
      globalRl.allowed ? 0 : globalRl.retryAfterSeconds,
      ipRl.allowed ? 0 : ipRl.retryAfterSeconds,
      60
    );
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan reset kata sandi. Silakan tunggu ${Math.ceil(
          retryAfter / 60
        )} menit.`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body: z.infer<typeof forgotRequestSchema>;
  try {
    body = forgotRequestSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data permintaan tidak valid."
        : "Data permintaan tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json(
      { error: "Permintaan ditolak oleh filter keamanan." },
      { status: 400 }
    );
  }

  const emailRl = await checkAuthRateLimit(
    `auth_forgot_email:${hashEmailKey(body.email)}`,
    3,
    3600
  );
  if (!emailRl.allowed) {
    return NextResponse.json(
      {
        error: `Batas permintaan reset untuk email ini tercapai. Tunggu ${Math.ceil(
          emailRl.retryAfterSeconds / 60
        )} menit.`,
      },
      { status: 429, headers: { "Retry-After": String(emailRl.retryAfterSeconds) } }
    );
  }

  const challengeCheck = await verifyAndConsumeHumanChallenge(
    body.challengeToken,
    body.challengeAnswer,
    2000
  );
  if (!challengeCheck.ok) {
    return NextResponse.json({ error: challengeCheck.reason }, { status: 400 });
  }

  try {
    const db = getDb();
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    // Anti-enumeration: return identical 200 response when email is not registered
    if (userRows.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          cooldownSeconds: 60,
          expiresInMinutes: 10,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const user = userRows[0];
    const existingPending = await db
      .select({ lastSentAt: passwordResetOtps.lastSentAt })
      .from(passwordResetOtps)
      .where(eq(passwordResetOtps.email, body.email))
      .limit(1);

    if (existingPending.length > 0) {
      const elapsedSec = Math.floor(
        (Date.now() - existingPending[0].lastSentAt.getTime()) / 1000
      );
      if (elapsedSec < 60) {
        const waitSec = 60 - elapsedSec;
        return NextResponse.json(
          { error: `Tunggu ${waitSec} detik sebelum meminta kode reset baru.` },
          { status: 429, headers: { "Retry-After": String(waitSec) } }
        );
      }
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const now = new Date();
    const otpHash = hashOtp(otp, body.email, expiresAt.getTime());

    await db
      .insert(passwordResetOtps)
      .values({
        email: body.email,
        otpHash,
        attempts: 0,
        lastSentAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: passwordResetOtps.email,
        set: {
          otpHash,
          attempts: 0,
          lastSentAt: now,
          expiresAt,
        },
      });

    const mailResult = await sendPasswordResetOtpEmail({
      to: user.email,
      name: user.name,
      otp,
    });

    if (!mailResult.ok) {
      await db
        .delete(passwordResetOtps)
        .where(eq(passwordResetOtps.email, body.email));
      return NextResponse.json({ error: mailResult.error }, { status: 502 });
    }

    return NextResponse.json(
      {
        ok: true,
        cooldownSeconds: 60,
        expiresInMinutes: 10,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("POST /api/auth/forgot-password/request-otp error:", err);
    return NextResponse.json(
      { error: "Gagal mengirim kode reset kata sandi." },
      { status: 500 }
    );
  }
}
