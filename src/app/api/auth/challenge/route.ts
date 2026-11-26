import { NextRequest, NextResponse } from "next/server";
import {
  checkAuthRateLimit,
  createHumanChallenge,
  getAuthClientIpHash,
} from "@/lib/auth-security";

export async function GET(request: NextRequest) {
  const ipHash = getAuthClientIpHash(request);
  const rl = await checkAuthRateLimit(`auth_challenge:${ipHash}`, 20, 300);

  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan verifikasi. Tunggu ${rl.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const challenge = createHumanChallenge();
  return NextResponse.json(challenge, {
    headers: { "Cache-Control": "no-store" },
  });
}
