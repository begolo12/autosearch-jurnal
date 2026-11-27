import crypto from "crypto";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { rateLimits } from "@/db/schema";

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

function getSecuritySecret(): string {
  const base =
    process.env.AUTH_SECRET?.trim() || process.env.DATABASE_URL?.trim();
  if (!base) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Server security secret is not configured.");
    }
    return crypto
      .createHash("sha256")
      .update("human-challenge:smartsari-dev-secret")
      .digest("hex");
  }
  return crypto
    .createHash("sha256")
    .update(`human-challenge:${base}`)
    .digest("hex");
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
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const reqHost = request.nextUrl.hostname.toLowerCase();
    const isDevLocal =
      process.env.NODE_ENV !== "production" &&
      (host === "localhost" || host === "127.0.0.1");
    return (
      host === reqHost ||
      host === "smartsari.my.id" ||
      host === "www.smartsari.my.id" ||
      host === "autosearch-jurnal.vercel.app" ||
      isDevLocal
    );
  } catch {
    return false;
  }
}

export function getAuthClientIpHash(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const rawIp =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  return crypto
    .createHash("sha256")
    .update(`smartsari-auth:${rawIp}`)
    .digest("hex")
    .slice(0, 32);
}

export function hashEmailKey(email: string): string {
  return crypto
    .createHash("sha256")
    .update(`smartsari-email:${email.trim().toLowerCase()}`)
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
    .createHmac("sha256", getSecuritySecret())
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
    .createHmac("sha256", getSecuritySecret())
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
