import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  attachAuthCookie,
  hashPassword,
  migrateGuestDataToUser,
} from "@/lib/auth";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  hasSubaddressAlias,
  isAllowedAuthOrigin,
  isDisposableEmail,
  validateStrongPassword,
  verifyAndConsumeHumanChallenge,
} from "@/lib/auth-security";
import { getGuestSessionId } from "@/lib/session";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").max(72),
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
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  let body: z.infer<typeof registerSchema>;
  try {
    body = registerSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data pendaftaran tidak valid."
        : "Data pendaftaran tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json(
      { error: "Pendaftaran ditolak oleh filter keamanan." },
      { status: 400 }
    );
  }

  const pwdError = validateStrongPassword(body.password);
  if (pwdError) {
    return NextResponse.json({ error: pwdError }, { status: 400 });
  }

  if (hasSubaddressAlias(body.email)) {
    return NextResponse.json(
      {
        error:
          "Email dengan tanda '+' tidak diizinkan. Gunakan alamat email utama Anda.",
      },
      { status: 400 }
    );
  }

  if (isDisposableEmail(body.email)) {
    return NextResponse.json(
      {
        error:
          "Email sementara (disposable) tidak diizinkan. Gunakan email aktif atau email kampus.",
      },
      { status: 400 }
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
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Email ini sudah terdaftar. Silakan masuk." },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        passwordHash: hashPassword(body.password),
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    const guestId = getGuestSessionId(request);
    if (guestId) {
      try {
        await migrateGuestDataToUser(guestId, `user:${created.id}`);
      } catch (migErr) {
        console.warn("Guest data migration on register failed:", migErr);
      }
    }

    return attachAuthCookie(
      NextResponse.json({ user: created }, { status: 201 }),
      created.id
    );
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { error: "Gagal membuat akun. Silakan coba lagi." },
      { status: 500 }
    );
  }
}
