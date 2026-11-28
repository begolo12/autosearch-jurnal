import { eq, like, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  bookmarks,
  conversions,
  emailOtpChallenges,
  passwordResetOtps,
  rateLimits,
  researchProjects,
  searchHistory,
  users,
} from "@/db/schema";
import {
  attachAuthCookie,
  clearAuthCookie,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  isAllowedAuthOrigin,
  validateStrongPassword,
} from "@/lib/auth-security";
import { clearGuestSessionCookie, resolveSessionContext } from "@/lib/session";

const patchAccountSchema = z
  .object({
    name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80).optional(),
    currentPassword: z.string().min(1).max(72).optional(),
    newPassword: z.string().min(8).max(72).optional(),
  })
  .refine(
    (d) => Boolean(d.name) || (Boolean(d.currentPassword) && Boolean(d.newPassword)),
    { message: "Tidak ada perubahan yang dikirimkan." }
  );

const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, "Kata sandi wajib diisi.").max(72),
  confirmText: z.literal("HAPUS", {
    error: "Ketik HAPUS dengan huruf kapital untuk konfirmasi.",
  }),
});

export async function PATCH(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const rl = await checkAuthRateLimit(`auth_account_patch:${ipHash}`, 10, 900);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak perubahan akun. Tunggu ${Math.ceil(
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
      { error: "Sesi Anda telah berakhir. Silakan masuk kembali." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: z.infer<typeof patchAccountSchema>;
  try {
    body = patchAccountSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data pembaruan akun tidak valid."
        : "Data pembaruan akun tidak valid.";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
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
      .where(eq(users.id, session.userId))
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      return clearAuthCookie(
        NextResponse.json(
          { error: "Akun tidak ditemukan." },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        )
      );
    }

    const changingPassword = Boolean(body.newPassword);
    let nextPasswordHash: string | undefined;

    if (changingPassword) {
      if (!body.currentPassword || !verifyPassword(body.currentPassword, existing.passwordHash)) {
        return NextResponse.json(
          { error: "Kata sandi saat ini salah." },
          { status: 401, headers: { "Cache-Control": "no-store" } }
        );
      }
      const pwdErr = validateStrongPassword(body.newPassword!);
      if (pwdErr) {
        return NextResponse.json(
          { error: pwdErr },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
      nextPasswordHash = hashPassword(body.newPassword!);
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(nextPasswordHash
          ? {
              passwordHash: nextPasswordHash,
              tokenVersion: sql`${users.tokenVersion} + 1`,
            }
          : {}),
      })
      .where(eq(users.id, existing.id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        tokenVersion: users.tokenVersion,
      });

    const res = NextResponse.json(
      {
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
        },
        passwordChanged: changingPassword,
      },
      { headers: { "Cache-Control": "no-store" } }
    );

    if (changingPassword) {
      return attachAuthCookie(res, updated.id, updated.tokenVersion);
    }
    return res;
  } catch (err) {
    console.error("PATCH /api/auth/account error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui profil akun." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const rl = await checkAuthRateLimit(`auth_account_delete:${ipHash}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan penghapusan akun. Tunggu ${Math.ceil(
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
      { error: "Sesi Anda telah berakhir. Silakan masuk kembali." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: z.infer<typeof deleteAccountSchema>;
  try {
    body = deleteAccountSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Konfirmasi penghapusan akun tidak valid."
        : "Konfirmasi penghapusan akun tidak valid.";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      return clearAuthCookie(
        NextResponse.json(
          { error: "Akun tidak ditemukan." },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        )
      );
    }

    if (!verifyPassword(body.currentPassword, existing.passwordHash)) {
      return NextResponse.json(
        { error: "Kata sandi salah." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const userSessionId = `user:${existing.id}`;

    await Promise.all([
      db.delete(bookmarks).where(eq(bookmarks.sessionId, userSessionId)),
      db.delete(researchProjects).where(eq(researchProjects.sessionId, userSessionId)),
      db.delete(searchHistory).where(eq(searchHistory.sessionId, userSessionId)),
      db.delete(conversions).where(eq(conversions.sessionId, userSessionId)),
      db.delete(emailOtpChallenges).where(eq(emailOtpChallenges.email, existing.email)),
      db.delete(passwordResetOtps).where(eq(passwordResetOtps.email, existing.email)),
      db.delete(rateLimits).where(like(rateLimits.key, `daily_user_ai:%:${existing.id}`)),
    ]);

    await db.delete(users).where(eq(users.id, existing.id));

    const res = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
    clearGuestSessionCookie(res);
    return clearAuthCookie(res);
  } catch (err) {
    console.error("DELETE /api/auth/account error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus akun secara permanen." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
