import crypto from "crypto";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";
import { deriveAppSecret } from "@/lib/auth";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.org",
  "guerrillamail.net",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "yopmail.com",
  "yopmail.fr",
  "sharklasers.com",
  "trashmail.com",
  "trashmail.de",
  "dispostable.com",
  "getnada.com",
  "mohmal.com",
  "maildrop.cc",
  "fakeinbox.com",
  "throwawaymail.com",
  "emailondeck.com",
  "burnermail.io",
  "mailnesia.com",
  "tempail.com",
  "harakirimail.com",
  "dropmail.me",
  "nada.email",
  "inboxkitten.com",
  "mintemail.com",
  "spamgourmet.com",
  "mytemp.email",
  "tmpmail.org",
  "tmpmail.net",
  "moakt.com",
  "mailcatch.com",
  "anonbox.net",
]);

export const DUMMY_PASSWORD_HASH =
  "0123456789abcdef0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function isAllowedHostname(host: string, reqHost: string): boolean {
  const normalized = host.toLowerCase();
  const vercelHost = process.env.VERCEL_URL
    ? process.env.VERCEL_URL.replace(/^https?:\/\//i, "")
        .split("/")[0]
        .split(":")[0]
        .toLowerCase()
    : "";

  const isDevLocal =
    process.env.NODE_ENV !== "production" &&
    (normalized === "localhost" || normalized === "127.0.0.1");

  return (
    normalized === reqHost ||
    normalized === "smartsari.my.id" ||
    normalized === "www.smartsari.my.id" ||
    normalized === "autosearch-jurnal.vercel.app" ||
    (Boolean(vercelHost) && normalized === vercelHost) ||
    isDevLocal
  );
}

export function isDisposableEmail(email: string): boolean {
  const atIdx = email.lastIndexOf("@");
  if (atIdx < 0) return true;
  const domain = email.slice(atIdx + 1).trim().toLowerCase();
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

export function hasSubaddressAlias(email: string): boolean {
  const atIdx = email.indexOf("@");
  if (atIdx <= 0) return false;
  return email.slice(0, atIdx).includes("+");
}

export function validateStrongPassword(password: string): string | null {
  if (password.length < 8) {
    return "Kata sandi minimal 8 karakter.";
  }
  if (password.length > 72) {
    return "Kata sandi maksimal 72 karakter.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Kata sandi wajib mengandung kombinasi huruf dan angka.";
  }
  return null;
}

export function isAllowedAuthOrigin(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const reqHost = request.nextUrl.hostname.toLowerCase();
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      return isAllowedHostname(parsed.hostname, reqHost);
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const parsed = new URL(referer);
      return isAllowedHostname(parsed.hostname, reqHost);
    } catch {
      return false;
    }
  }

  return secFetchSite === "same-origin" || process.env.NODE_ENV !== "production";
}

export function isAllowedSameOriginAssetRequest(request: NextRequest): boolean {
  return isAllowedAuthOrigin(request);
}

export function getTrustedClientIp(request: NextRequest): string {
  const vercelIp = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (vercelIp) return vercelIp;

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const parts = forwardedFor
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  return "unknown";
}

export function getClientIpHash(request: NextRequest, scope = "ip"): string {
  const rawIp = getTrustedClientIp(request);
  return crypto
    .createHmac("sha256", deriveAppSecret("ip-hash"))
    .update(`${scope}:${rawIp}`)
    .digest("hex")
    .slice(0, 32);
}

export function getAuthClientIpHash(request: NextRequest): string {
  return getClientIpHash(request, "auth");
}

export function hashEmailKey(email: string): string {
  return crypto
    .createHmac("sha256", deriveAppSecret("email-key"))
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

/**
 * Fail-closed rate limiter for authentication & registration endpoints.
 * Unlike search rate-limiting, DB errors deny the request so attackers cannot
 * bypass limits during transient failures.
 */
export async function checkAuthRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
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
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds };
  } catch (err) {
    console.error("Fail-closed auth rate limit error:", err);
    return { allowed: false, retryAfterSeconds: 60 };
  }
}

export function getTurnstileSiteKey(): string | null {
  const key = (
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    ""
  ).trim();
  return key || null;
}

export function isTurnstileEnabled(): boolean {
  return Boolean(
    process.env.TURNSTILE_SECRET_KEY?.trim() && getTurnstileSiteKey()
  );
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    return {
      ok: false,
      reason: "Konfigurasi verifikasi keamanan server tidak lengkap.",
    };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp && remoteIp !== "unknown") {
      body.set("remoteip", remoteIp);
    }

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        reason: "Verifikasi keamanan sementara gagal. Silakan coba lagi.",
      };
    }

    const data = (await res.json()) as { success?: boolean };
    if (!data.success) {
      return {
        ok: false,
        reason: "Verifikasi anti-bot gagal. Silakan ulangi tantangan keamanan.",
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("Cloudflare Turnstile verify error:", err);
    return {
      ok: false,
      reason: "Gagal menghubungi layanan verifikasi anti-bot.",
    };
  }
}

export function createHumanChallenge(): { question: string; token: string } {
  const a = crypto.randomInt(3, 15);
  const b = crypto.randomInt(2, 13);
  const useAdd = crypto.randomInt(0, 2) === 0;
  const high = Math.max(a, b);
  const low = Math.min(a, b);

  const answer = useAdd ? String(a + b) : String(high - low);
  const question = useAdd ? `Berapa ${a} + ${b}?` : `Berapa ${high} - ${low}?`;

  const iat = Date.now();
  const exp = iat + 5 * 60 * 1000;
  const nonce = crypto.randomBytes(16).toString("hex");
  const h = crypto
    .createHash("sha256")
    .update(`${answer}:${nonce}:${iat}`)
    .digest("hex");

  const payloadB64 = Buffer.from(
    JSON.stringify({ iat, exp, nonce, h }),
    "utf8"
  ).toString("base64url");

  const sig = crypto
    .createHmac("sha256", deriveAppSecret("human-challenge"))
    .update(payloadB64)
    .digest("base64url");

  return {
    question,
    token: `${payloadB64}.${sig}`,
  };
}

export async function verifyAndConsumeHumanChallenge(
  token: string,
  answer: string,
  minElapsedMs = 2000
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx <= 0) {
    return { ok: false, reason: "Token verifikasi keamanan tidak valid." };
  }

  const payloadB64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac("sha256", deriveAppSecret("human-challenge"))
    .update(payloadB64)
    .digest("base64url");

  try {
    const sigBuf = Buffer.from(sig, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return { ok: false, reason: "Token verifikasi tidak sah." };
    }
  } catch {
    return { ok: false, reason: "Token verifikasi tidak sah." };
  }

  let parsed: { iat?: number; exp?: number; nonce?: string; h?: string };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "Format token verifikasi rusak." };
  }

  if (
    typeof parsed.iat !== "number" ||
    typeof parsed.exp !== "number" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.h !== "string"
  ) {
    return { ok: false, reason: "Data verifikasi tidak lengkap." };
  }

  const now = Date.now();
  if (now > parsed.exp) {
    return {
      ok: false,
      reason: "Kode verifikasi kedaluwarsa. Muat ulang soal lalu coba lagi.",
    };
  }

  if (now - parsed.iat < minElapsedMs) {
    return {
      ok: false,
      reason:
        "Pengiriman terlalu cepat. Tunggu beberapa detik lalu coba lagi.",
    };
  }

  const candidateHash = crypto
    .createHash("sha256")
    .update(`${answer.trim()}:${parsed.nonce}:${parsed.iat}`)
    .digest("hex");

  try {
    const aBuf = Buffer.from(candidateHash, "hex");
    const bBuf = Buffer.from(parsed.h, "hex");
    if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
      return { ok: false, reason: "Jawaban verifikasi anti-bot salah." };
    }
  } catch {
    return { ok: false, reason: "Jawaban verifikasi anti-bot salah." };
  }

  // Atomic single-use lock so a valid challenge cannot be replayed
  try {
    const db = getDb();
    const consumed = await db
      .insert(rateLimits)
      .values({
        key: `challenge_used:${parsed.nonce}`,
        count: 1,
        resetAt: new Date(parsed.exp),
      })
      .onConflictDoNothing()
      .returning({ key: rateLimits.key });

    if (consumed.length === 0) {
      return {
        ok: false,
        reason: "Verifikasi sudah digunakan. Muat ulang soal baru.",
      };
    }
  } catch (err) {
    console.error("Challenge replay-lock error:", err);
    return {
      ok: false,
      reason: "Gagal memverifikasi keamanan. Silakan coba lagi.",
    };
  }

  return { ok: true };
}

export async function verifyHumanVerification(params: {
  turnstileToken?: string;
  challengeToken?: string;
  challengeAnswer?: string;
  remoteIp?: string;
  minElapsedMs?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (isTurnstileEnabled()) {
    const token = params.turnstileToken?.trim() || "";
    if (token.length < 10) {
      return {
        ok: false,
        reason: "Selesaikan verifikasi keamanan terlebih dahulu.",
      };
    }
    return verifyTurnstileToken(token, params.remoteIp);
  }

  const challengeToken = params.challengeToken?.trim() || "";
  const challengeAnswer = params.challengeAnswer?.trim() || "";
  if (challengeToken.length < 10 || challengeAnswer.length === 0) {
    return { ok: false, reason: "Verifikasi keamanan wajib diisi." };
  }

  return verifyAndConsumeHumanChallenge(
    challengeToken,
    challengeAnswer,
    params.minElapsedMs ?? 2000
  );
}
