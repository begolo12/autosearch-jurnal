import crypto from "crypto";
import { eq } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  deriveAppSecret,
  verifyAuthTokenPayload,
} from "@/lib/auth";

export const SESSION_COOKIE_NAME = "pc_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionContext {
  sessionId: string;
  guestSessionId: string | null;
  isNew: boolean;
  userId: string | null;
  clearStaleAuth: boolean;
}

export function signGuestSessionId(id: string): string {
  const data = `g1.${id}`;
  const sig = crypto
    .createHmac("sha256", deriveAppSecret("guest-session"))
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

export function verifyGuestSessionCookie(
  raw: string | undefined
): string | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== "g1") return null;
  const [, id, sig] = parts;
  if (!id || !sig || !UUID_REGEX.test(id)) return null;

  const expected = crypto
    .createHmac("sha256", deriveAppSecret("guest-session"))
    .update(`g1.${id}`)
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
    return id;
  } catch {
    return null;
  }
}

export function getGuestSessionId(request: NextRequest): string | null {
  const existing = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  return verifyGuestSessionCookie(existing);
}

export function clearGuestSessionCookie<T extends NextResponse>(response: T): T {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function resolveSessionContext(
  request: NextRequest
): Promise<SessionContext> {
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  let clearStaleAuth = false;

  if (authCookie) {
    const payload = verifyAuthTokenPayload(authCookie);
    if (!payload) {
      clearStaleAuth = true;
    } else {
      try {
        const db = getDb();
        const rows = await db
          .select({ id: users.id, tokenVersion: users.tokenVersion })
          .from(users)
          .where(eq(users.id, payload.userId))
          .limit(1);

        const user = rows[0];
        if (user && user.tokenVersion === payload.tokenVersion) {
          return {
            sessionId: `user:${user.id}`,
            guestSessionId: null,
            isNew: false,
            userId: user.id,
            clearStaleAuth: false,
          };
        }
        clearStaleAuth = true;
      } catch (err) {
        console.warn("[SmartSari] Session auth DB check error:", err);
        clearStaleAuth = false;
      }
    }
  }

  const existingGuest = getGuestSessionId(request);
  if (existingGuest) {
    return {
      sessionId: existingGuest,
      guestSessionId: existingGuest,
      isNew: false,
      userId: null,
      clearStaleAuth,
    };
  }

  const newId = crypto.randomUUID();
  return {
    sessionId: newId,
    guestSessionId: newId,
    isNew: true,
    userId: null,
    clearStaleAuth,
  };
}

export function attachSessionCookie<T extends NextResponse>(
  response: T,
  sessionId: string,
  isNew: boolean,
  clearStaleAuth = false
): T {
  if (clearStaleAuth) {
    clearAuthCookie(response);
  }
  if (!isNew || sessionId.startsWith("user:")) return response;

  response.cookies.set(SESSION_COOKIE_NAME, signGuestSessionId(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });

  return response;
}
