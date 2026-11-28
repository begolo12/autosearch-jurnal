import { eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";
import { getClientIpHash } from "@/lib/auth-security";
import { pruneExpiredRows } from "@/lib/rate-limit";
import { resolveSessionContext, type SessionContext } from "@/lib/session";

export type DailyQuotaResult =
  | {
      allowed: true;
      session: SessionContext;
      refund: () => Promise<void>;
    }
  | {
      allowed: false;
      status: 429 | 503;
      error: string;
      requireLogin: boolean;
      retryAfterSeconds: number;
    };

async function incrementDailyCounter(
  key: string,
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

async function decrementCounter(key: string): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(rateLimits)
      .set({ count: sql`GREATEST(${rateLimits.count} - 1, 0)` })
      .where(eq(rateLimits.key, key));
  } catch (err) {
    console.warn("[SmartSari] Quota refund warning:", err);
  }
}

export async function checkDailyAiQuota(
  request: NextRequest,
  existingSession?: SessionContext
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
    const session = existingSession ?? (await resolveSessionContext(request));

    // Check global capacity first so personal quota is never burned during global saturation
    const globalKey = `daily_global_ai:${dayKey}`;
    const globalCheck = await incrementDailyCounter(
      globalKey,
      now,
      nextMidnight
    );
    if (globalCheck.count > globalLimit) {
      await decrementCounter(globalKey);
      return {
        allowed: false,
        status: 503,
        error:
          "Kapasitas harian SmartSari sedang penuh. Silakan coba kembali besok.",
        requireLogin: false,
        retryAfterSeconds: globalCheck.retryAfterSeconds,
      };
    }

    if (session.userId) {
      const userKey = `daily_user_ai:${dayKey}:${session.userId}`;
      const userCheck = await incrementDailyCounter(userKey, now, nextMidnight);
      if (userCheck.count > userLimit) {
        await Promise.all([
          decrementCounter(globalKey),
          decrementCounter(userKey),
        ]);
        return {
          allowed: false,
          status: 429,
          error: `Kuota harian akun Anda (${userLimit} pemrosesan/hari) telah tercapai. Kuota akan diperbarui besok.`,
          requireLogin: false,
          retryAfterSeconds: userCheck.retryAfterSeconds,
        };
      }

      return {
        allowed: true,
        session,
        refund: async () => {
          await Promise.all([
            decrementCounter(globalKey),
            decrementCounter(userKey),
          ]);
        },
      };
    }

    // Guest quota: enforce across both trusted IP hash and signed guest session ID
    const ipHash = getClientIpHash(request, "quota");
    const ipKey = `daily_guest_ai_ip:${dayKey}:${ipHash}`;
    const sidKey = session.guestSessionId
      ? `daily_guest_ai_sid:${dayKey}:${session.guestSessionId}`
      : null;

    const ipCheck = await incrementDailyCounter(ipKey, now, nextMidnight);
    const sidCheck = sidKey
      ? await incrementDailyCounter(sidKey, now, nextMidnight)
      : null;

    if (
      ipCheck.count > guestLimit ||
      (sidCheck && sidCheck.count > guestLimit)
    ) {
      const rollback: Promise<void>[] = [decrementCounter(globalKey)];
      if (ipCheck.count <= guestLimit) {
        rollback.push(decrementCounter(ipKey));
      } else {
        rollback.push(decrementCounter(ipKey));
      }
      if (sidCheck && sidKey) {
        rollback.push(decrementCounter(sidKey));
      }
      await Promise.all(rollback);

      const retryAfterSeconds = Math.max(
        ipCheck.retryAfterSeconds,
        sidCheck?.retryAfterSeconds ?? 0
      );

      return {
        allowed: false,
        status: 429,
        error: `Kuota tamu harian Anda (${guestLimit}x/hari) telah habis. Masuk atau daftar akun gratis untuk mendapatkan kuota hingga ${userLimit}x/hari.`,
        requireLogin: true,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      session,
      refund: async () => {
        const tasks = [decrementCounter(globalKey), decrementCounter(ipKey)];
        if (sidKey) tasks.push(decrementCounter(sidKey));
        await Promise.all(tasks);
      },
    };
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
