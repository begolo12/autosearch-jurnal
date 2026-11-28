import crypto from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { emailOtpChallenges, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  getTrustedClientIp,
  hasSubaddressAlias,
  hashEmailKey,
  isAllowedAuthOrigin,
  isDisposableEmail,
  validateStrongPassword,
  verifyHumanVerification,
} from "@/lib/auth-security";
import {
  hashOtp,
  sendAlreadyRegisteredNoticeEmail,
  sendRegistrationOtpEmail,
} from "@/lib/email";

const requestOtpSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").max(72),
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
  challengeToken: z.string().max(512).optional(),
  challengeAnswer: z.string().trim().max(16).optional(),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);

  const [globalRl, burstRl, hourRl] = await Promise.all([
    checkAuthRateLimit("auth_register_global", 30, 600),
    checkAuthRateLimit(`auth_register_burst:${ipHash}`, 5, 600),
    checkAuthRateLimit(`auth_register_hour:${ipHash}`, 3, 3600),
  ]);

  if (!globalRl.allowed || !burstRl.allowed || !hourRl.allowed) {
    const retryAfter = Math.max(
      globalRl.allowed ? 0 : globalRl.retryAfterSeconds,
      burstRl.allowed ? 0 : burstRl.retryAfterSeconds,
      hourRl.allowed ? 0 : hourRl.retryAfterSeconds,
      60
    );
    return NextResponse.json(
      {
        error: `Batas pendaftaran tercapai untuk mencegah spam. Silakan tunggu ${Math.ceil(
          retryAfter / 60
        )} menit lagi.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  let body: z.infer<typeof requestOtpSchema>;
  try {
    body = requestOtpSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data pendaftaran tidak valid."
        : "Data pendaftaran tidak valid.";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json(
      { error: "Pendaftaran ditolak oleh filter keamanan." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const pwdError = validateStrongPassword(body.password);
  if (pwdError) {
    return NextResponse.json(
      { error: pwdError },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (hasSubaddressAlias(body.email)) {
    return NextResponse.json(
      {
        error:
          "Email dengan tanda '+' tidak diizinkan. Gunakan alamat email utama Anda.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (isDisposableEmail(body.email)) {
    return NextResponse.json(
      {
        error:
          "Email sementara (disposable) tidak diizinkan. Gunakan email aktif atau email kampus.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const emailKey = hashEmailKey(body.email);
  const emailRl = await checkAuthRateLimit(`auth_otp_email:${emailKey}`, 3, 3600);
  if (!emailRl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan OTP untuk email ini. Tunggu ${Math.ceil(
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

  const challengeCheck = await verifyHumanVerification({
    turnstileToken: body.turnstileToken,
    challengeToken: body.challengeToken,
    challengeAnswer: body.challengeAnswer,
    remoteIp: getTrustedClientIp(request),
    minElapsedMs: 2000,
  });
  if (!challengeCheck.ok) {
    return NextResponse.json(
      { error: challengeCheck.reason },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const db = getDb();

    const existingUser = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    // Anti-enumeration: perform password hashing parity & return identical 200 OK
    if (existingUser.length > 0) {
      const cooldown = await checkAuthRateLimit(
        `auth_reg_existing_cooldown:${emailKey}`,
        1,
        60
      );
      if (!cooldown.allowed) {
        return NextResponse.json(
          {
            error: `Tunggu ${cooldown.retryAfterSeconds} detik sebelum meminta kode OTP baru.`,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(cooldown.retryAfterSeconds),
              "Cache-Control": "no-store",
            },
          }
        );
      }

      hashPassword(body.password);
      void sendAlreadyRegisteredNoticeEmail({
        to: existingUser[0].email,
        name: existingUser[0].name,
      }).catch((err) => {
        console.warn("[SmartSari] Existing account notice email failed:", err);
      });

      return NextResponse.json(
        {
          ok: true,
          email: body.email,
          cooldownSeconds: 60,
          expiresInMinutes: 10,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const existingPending = await db
      .select({ lastSentAt: emailOtpChallenges.lastSentAt })
      .from(emailOtpChallenges)
      .where(eq(emailOtpChallenges.email, body.email))
      .limit(1);

    if (existingPending.length > 0) {
      const elapsedSec = Math.floor(
        (Date.now() - existingPending[0].lastSentAt.getTime()) / 1000
      );
      if (elapsedSec < 60) {
        const waitSec = 60 - elapsedSec;
        return NextResponse.json(
          { error: `Tunggu ${waitSec} detik sebelum meminta kode OTP baru.` },
          {
            status: 429,
            headers: {
              "Retry-After": String(waitSec),
              "Cache-Control": "no-store",
            },
          }
        );
      }
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const now = new Date();
    const passwordHash = hashPassword(body.password);
    const otpHash = hashOtp(otp, body.email, expiresAt.getTime());

    await db
      .insert(emailOtpChallenges)
      .values({
        email: body.email,
        name: body.name,
        passwordHash,
        otpHash,
        attempts: 0,
        lastSentAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: emailOtpChallenges.email,
        set: {
          name: body.name,
          passwordHash,
          otpHash,
          attempts: 0,
          lastSentAt: now,
          expiresAt,
        },
      });

    const mailResult = await sendRegistrationOtpEmail({
      to: body.email,
      name: body.name,
      otp,
    });

    if (!mailResult.ok) {
      await db
        .delete(emailOtpChallenges)
        .where(eq(emailOtpChallenges.email, body.email));
      return NextResponse.json(
        { error: mailResult.error },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        email: body.email,
        cooldownSeconds: 60,
        expiresInMinutes: 10,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("POST /api/auth/register/request-otp error:", err);
    return NextResponse.json(
      { error: "Gagal memproses pengiriman OTP." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
