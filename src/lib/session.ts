import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "pc_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getSessionContext(request: NextRequest): {
  sessionId: string;
  isNew: boolean;
} {
  const existing = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) {
    return { sessionId: existing, isNew: false };
  }
  return { sessionId: crypto.randomUUID(), isNew: true };
}

export function attachSessionCookie<T extends NextResponse>(
  response: T,
  sessionId: string,
  isNew: boolean
): T {
  if (!isNew) return response;

  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });

  return response;
}
