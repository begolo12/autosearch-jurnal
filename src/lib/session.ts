import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";

export const SESSION_COOKIE_NAME = "pc_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getGuestSessionId(request: NextRequest): string | null {
  const existing = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) {
    return existing;
  }
  return null;
}

export function getSessionContext(request: NextRequest): {
  sessionId: string;
  isNew: boolean;
  userId: string | null;
} {
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  const userId = verifyAuthToken(authCookie);
  if (userId) {
    return {
      sessionId: `user:${userId}`,
      isNew: false,
      userId,
    };
  }

  const existing = getGuestSessionId(request);
  if (existing) {
    return { sessionId: existing, isNew: false, userId: null };
  }
  return { sessionId: crypto.randomUUID(), isNew: true, userId: null };
}

export function attachSessionCookie<T extends NextResponse>(
  response: T,
  sessionId: string,
  isNew: boolean
): T {
  if (!isNew || sessionId.startsWith("user:")) return response;

  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });

  return response;
}
