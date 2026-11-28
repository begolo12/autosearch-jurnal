import crypto from "crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
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
import { clearGuestSessionCookie, getGuestSessionId } from "@/lib/session";

const verifyOtpSchema = z.object({
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Kode OTP harus terdiri dari 6 digit angka."),
});

function isPgUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
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
      {
        status: 429,
        headers: {
          "Retry-After": String(ipRl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
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
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const db = getDb();
    const now = new Date();

    // Atomically increment attempts before verifying so concurrent requests cannot bypass max 5 tries
    const [pending] = await db
      .update(emailOtpChallenges)
      .set({ attempts: sql`${emailOtpChallenges.attempts} + 1` })
      .where(
        and(
          eq(emailOtpChallenges.email, body.email),
          lt(emailOtpChallenges.attempts, 5),
          gt(emailOtpChallenges.expiresAt, now)
        )
      )
      .returning();

    if (!pending) {
      const existing = await db
        .select({
          id: emailOtpChallenges.id,
          attempts: emailOtpChallenges.attempts,
          expiresAt: emailOtpChallenges.expiresAt,
        })
        .from(emailOtpChallenges)
        .where(eq(emailOtpChallenges.email, body.email))
        .limit(1);

      const stale = existing[0];
      if (stale) {
        await db
          .delete(emailOtpChallenges)
          .where(eq(emailOtpChallenges.id, stale.id));

        if (stale.attempts >= 5) {
          return NextResponse.json(
            {
              error:
                "Terlalu banyak percobaan OTP salah. Silakan ulangi pendaftaran.",
            },
            { status: 429, headers: { "Cache-Control": "no-store" } }
          );
        }
        return NextResponse.json(
          { error: "Kode OTP sudah kedaluwarsa. Silakan minta kode baru." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        {
          error:
            "Kode OTP tidak ditemukan atau sudah kedaluwarsa. Minta kode baru.",
        },
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
          .delete(emailOtpChallenges)
          .where(eq(emailOtpChallenges.id, pending.id));
        return NextResponse.json(
          {
            error:
              "Kode OTP salah 5 kali dan telah hangus. Silakan ulangi pendaftaran.",
          },
          { status: 429, headers: { "Cache-Control": "no-store" } }
        );
      }

      return NextResponse.json(
        { error: `Kode OTP salah. Sisa percobaan: ${5 - pending.attempts} kali.` },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Atomically consume OTP row so two parallel requests cannot both succeed
    const consumed = await db
      .delete(emailOtpChallenges)
      .where(eq(emailOtpChallenges.id, pending.id))
      .returning({ id: emailOtpChallenges.id });

    if (consumed.length === 0) {
      return NextResponse.json(
        { error: "Kode OTP sudah digunakan." },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    let created: {
      id: string;
      email: string;
      name: string;
      tokenVersion: number;
    };
    try {
      const [inserted] = await db
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
          tokenVersion: users.tokenVersion,
        });
      created = inserted;
    } catch (insertErr) {
      if (isPgUniqueViolation(insertErr)) {
        return NextResponse.json(
          { error: "Gagal memverifikasi kode OTP. Silakan coba lagi atau masuk." },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
      throw insertErr;
    }

    const guestId = getGuestSessionId(request);
    if (guestId) {
      try {
        await migrateGuestDataToUser(guestId, `user:${created.id}`);
      } catch (migErr) {
        console.warn("Guest data migration on verify-otp failed:", migErr);
      }
    }

    const res = NextResponse.json(
      {
        user: {
          id: created.id,
          email: created.email,
          name: created.name,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
    clearGuestSessionCookie(res);
    return attachAuthCookie(res, created.id, created.tokenVersion);
  } catch (err) {
    console.error("POST /api/auth/register/verify-otp error:", err);
    return NextResponse.json(
      { error: "Gagal memverifikasi kode OTP." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
