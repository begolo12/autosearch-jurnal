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
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function deriveAppSecret(purpose: string): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 32) {
      throw new Error(
        "AUTH_SECRET must be set to at least 32 characters in production."
      );
    }
    return crypto
      .createHash("sha256")
      .update(`${purpose}:${secret}`)
      .digest("hex");
  }
  const base = secret || "smartsari-dev-secret-change-in-production";
  return crypto
    .createHash("sha256")
    .update(`${purpose}:${base}`)
    .digest("hex");
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

export function signAuthToken(userId: string, tokenVersion = 1): string {
  const payload = {
    uid: userId,
    v: tokenVersion,
    exp: Date.now() + THIRTY_DAYS_SECONDS * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  const data = `v2.${payloadB64}`;
  const sig = crypto
    .createHmac("sha256", deriveAppSecret("auth-token"))
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifyAuthTokenPayload(
  token: string | undefined
): { userId: string; tokenVersion: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v2") return null;
  const [, payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = crypto
    .createHmac("sha256", deriveAppSecret("auth-token"))
    .update(`v2.${payloadB64}`)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { uid?: unknown; v?: unknown; exp?: unknown };
    if (
      typeof parsed.uid !== "string" ||
      !UUID_REGEX.test(parsed.uid) ||
      typeof parsed.v !== "number" ||
      !Number.isInteger(parsed.v) ||
      parsed.v < 1 ||
      typeof parsed.exp !== "number" ||
      !Number.isFinite(parsed.exp) ||
      Date.now() >= parsed.exp
    ) {
      return null;
    }
    return { userId: parsed.uid, tokenVersion: parsed.v };
  } catch {
    return null;
  }
}

export function verifyAuthToken(token: string | undefined): string | null {
  return verifyAuthTokenPayload(token)?.userId ?? null;
}

export function attachAuthCookie<T extends NextResponse>(
  response: T,
  userId: string,
  tokenVersion = 1
): T {
  response.cookies.set(AUTH_COOKIE_NAME, signAuthToken(userId, tokenVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
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
