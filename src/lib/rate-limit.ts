import crypto from "crypto";
import { eq } from "drizzle-orm";
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
  windowSeconds: number
): Promise<RateLimitResult> {
  const ipHash = getClientIpHash(request);
  const key = `${bucket}:${ipHash}`;
  const now = new Date();
  const nextReset = new Date(now.getTime() + windowSeconds * 1000);

  try {
    const db = getDb();
    const existing = await db
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, key))
      .limit(1);

    if (existing.length === 0 || existing[0].resetAt <= now) {
      await db
        .insert(rateLimits)
        .values({ key, count: 1, resetAt: nextReset })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: { count: 1, resetAt: nextReset },
        });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: windowSeconds,
      };
    }

    const current = existing[0];
    if (current.count >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.resetAt.getTime() - now.getTime()) / 1000)
      );
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    const updatedCount = current.count + 1;
    await db
      .update(rateLimits)
      .set({ count: updatedCount })
      .where(eq(rateLimits.key, key));

    return {
      allowed: true,
      remaining: Math.max(0, limit - updatedCount),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt.getTime() - now.getTime()) / 1000)
      ),
    };
  } catch (err) {
    // Fail open on transient DB errors so public users are never blocked
    console.warn("Rate limit check bypassed:", err);
    return { allowed: true, remaining: limit, retryAfterSeconds: windowSeconds };
  }
}
