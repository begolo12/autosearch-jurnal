import crypto from "crypto";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function getClientIpHash(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const rawIp =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  return crypto
    .createHash("sha256")
    .update(`pustakacari:${rawIp}`)
    .digest("hex")
    .slice(0, 32);
}

export async function checkRateLimit(
  request: NextRequest,
  bucket: string,
  limit: number,
  windowSeconds: number,
  failClosed = false
): Promise<RateLimitResult> {
  const ipHash = getClientIpHash(request);
  const key = `${bucket}:${ipHash}`;
  const now = new Date();
  const nextReset = new Date(now.getTime() + windowSeconds * 1000);
  const nowIso = now.toISOString();
  const nextResetIso = nextReset.toISOString();

  try {
    const db = getDb();
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: nextReset })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowIso}::timestamptz THEN 1 ELSE ${rateLimits.count} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${nowIso}::timestamptz THEN ${nextResetIso}::timestamptz ELSE ${rateLimits.resetAt} END`,
        },
      })
      .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

    const count = row?.count ?? 1;
    const resetAt = row?.resetAt ?? nextReset;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000)
    );

    if (count > limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    return {
      allowed: true,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  } catch (err) {
    if (failClosed) {
      console.error("Fail-closed rate limit error:", err);
      return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
    }
    // Fail open on transient DB errors so public search is not blocked
    console.warn("Rate limit check bypassed:", err);
    return { allowed: true, remaining: limit, retryAfterSeconds: windowSeconds };
  }
}
