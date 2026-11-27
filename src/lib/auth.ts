import crypto from "crypto";
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  bookmarks,
  conversions,
  researchProjects,
  searchHistory,
} from "@/db/schema";

export const AUTH_COOKIE_NAME = "smartsari_auth";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getAuthSecret(): string {
  const base =
    process.env.AUTH_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  if (!base) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Server authentication secret is not configured.");
    }
    return crypto
      .createHash("sha256")
      .update("auth-token:smartsari-dev-secret")
      .digest("hex");
  }
  return crypto.createHash("sha256").update(`auth-token:${base}`).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  try {
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    const originalBuf = Buffer.from(originalHex, "hex");
    if (derivedBuf.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, originalBuf);
  } catch {
    return false;
  }
}

export function signAuthToken(userId: string): string {
  const sig = crypto
    .createHmac("sha256", getAuthSecret())
    .update(userId)
    .digest("hex");
  return `${userId}.${sig}`;
}

export function verifyAuthToken(token: string | undefined): string | null {
  if (!token) return null;
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  const userId = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId
    )
  ) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", getAuthSecret())
    .update(userId)
    .digest("hex");
  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    return crypto.timingSafeEqual(sigBuf, expectedBuf) ? userId : null;
  } catch {
    return null;
  }
}

export function attachAuthCookie<T extends NextResponse>(
  response: T,
  userId: string
): T {
  response.cookies.set(AUTH_COOKIE_NAME, signAuthToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}

export function clearAuthCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function migrateGuestDataToUser(
  guestSessionId: string,
  userSessionId: string
): Promise<void> {
  if (!guestSessionId || guestSessionId === userSessionId) return;
  const db = getDb();

  await db
    .update(researchProjects)
    .set({ sessionId: userSessionId })
    .where(eq(researchProjects.sessionId, guestSessionId));

  await db
    .update(searchHistory)
    .set({ sessionId: userSessionId })
    .where(eq(searchHistory.sessionId, guestSessionId));

  await db
    .update(conversions)
    .set({ sessionId: userSessionId })
    .where(eq(conversions.sessionId, guestSessionId));

  const guestBookmarks = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.sessionId, guestSessionId));

  if (guestBookmarks.length === 0) return;

  const existingUserBookmarks = await db
    .select({ paperKey: bookmarks.paperKey })
    .from(bookmarks)
    .where(eq(bookmarks.sessionId, userSessionId));

  const existingKeys = new Set(existingUserBookmarks.map((b) => b.paperKey));

  for (const gb of guestBookmarks) {
    if (existingKeys.has(gb.paperKey)) {
      await db.delete(bookmarks).where(eq(bookmarks.id, gb.id));
    } else {
      await db
        .update(bookmarks)
        .set({ sessionId: userSessionId })
        .where(eq(bookmarks.id, gb.id));
    }
  }
}
