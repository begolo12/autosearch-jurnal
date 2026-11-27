import { lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import {
  emailOtpChallenges,
  passwordResetOtps,
  rateLimits,
  searchCache,
} from "@/db/schema";
import { getAuthClientIpHash } from "@/lib/auth-security";
import { getSessionContext } from "@/lib/session";

export type DailyQuotaResult =
  | { allowed: true }
  | {
      allowed: false;
      status: 429 | 503;
      error: string;
      requireLogin: boolean;
      retryAfterSeconds: number;
    };

async function incrementDailyCounter(
  key: string,
  limit: number,
  now: Date,
  nextMidnight: Date
): Promise<{ count: number; retryAfterSeconds: number }> {
  const db = getDb();
  const nowIso = now.toISOString();
  const resetIso = nextMidnight.toISOString();

  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: nextMidnight })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowIso}::timestamptz THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowIso}::timestamptz THEN ${resetIso}::timestamptz ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  const count = row?.count ?? 1;
  const resetAt = row?.resetAt ?? nextMidnight;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - now.getTime()) / 1000)
  );
  return { count, retryAfterSeconds };
}

async function pruneExpiredRows(): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();
    await Promise.all([
      db.delete(rateLimits).where(lt(rateLimits.resetAt, now)),
      db.delete(searchCache).where(lt(searchCache.expiresAt, now)),
      db.delete(emailOtpChallenges).where(lt(emailOtpChallenges.expiresAt, now)),
      db.delete(passwordResetOtps).where(lt(passwordResetOtps.expiresAt, now)),
    ]);
  } catch (err) {
    console.warn("[SmartSari] Opportunistic TTL cleanup warning:", err);
  }
}

export async function checkDailyAiQuota(
  request: NextRequest
): Promise<DailyQuotaResult> {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const nextMidnight = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );

  const globalLimit = Math.max(
    1,
    Number(process.env.DAILY_GLOBAL_AI_LIMIT) || 1500
  );
  const userLimit = Math.max(
    1,
    Number(process.env.DAILY_USER_AI_LIMIT) || 20
  );
  const guestLimit = Math.max(
    1,
    Number(process.env.DAILY_GUEST_AI_LIMIT) || 3
  );

  if (Math.random() < 0.01) {
    void pruneExpiredRows();
  }

  try {
    const { userId } = getSessionContext(request);

    if (userId) {
      const userCheck = await incrementDailyCounter(
        `daily_user_ai:${dayKey}:${userId}`,
        userLimit,
        now,
        nextMidnight
      );
      if (userCheck.count > userLimit) {
        return {
          allowed: false,
          status: 429,
          error: `Kuota harian akun Anda (${userLimit} pemrosesan/hari) telah tercapai. Kuota akan diperbarui besok.`,
          requireLogin: false,
          retryAfterSeconds: userCheck.retryAfterSeconds,
        };
      }
    } else {
      const ipHash = getAuthClientIpHash(request);
      const guestCheck = await incrementDailyCounter(
        `daily_guest_ai:${dayKey}:${ipHash}`,
        guestLimit,
        now,
        nextMidnight
      );
      if (guestCheck.count > guestLimit) {
        return {
          allowed: false,
          status: 429,
          error: `Kuota tamu harian Anda (${guestLimit}x/hari) telah habis. Masuk atau daftar akun gratis untuk mendapatkan kuota hingga ${userLimit}x/hari.`,
          requireLogin: true,
          retryAfterSeconds: guestCheck.retryAfterSeconds,
        };
      }
    }

    const globalCheck = await incrementDailyCounter(
      `daily_global_ai:${dayKey}`,
      globalLimit,
      now,
      nextMidnight
    );
    if (globalCheck.count > globalLimit) {
      return {
        allowed: false,
        status: 503,
        error:
          "Kapasitas harian SmartSari sedang penuh. Silakan coba kembali besok.",
        requireLogin: false,
        retryAfterSeconds: globalCheck.retryAfterSeconds,
      };
    }

    return { allowed: true };
  } catch (err) {
    console.error("[SmartSari] Daily AI quota check error:", err);
    return {
      allowed: false,
      status: 503,
      error: "Layanan pemrosesan sedang sibuk. Silakan coba beberapa saat lagi.",
      requireLogin: false,
      retryAfterSeconds: 60,
    };
  }
}
