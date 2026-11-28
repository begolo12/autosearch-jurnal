import { NextRequest, NextResponse } from "next/server";
import {
  checkAuthRateLimit,
  createHumanChallenge,
  getAuthClientIpHash,
  getTurnstileSiteKey,
  isAllowedSameOriginAssetRequest,
  isTurnstileEnabled,
} from "@/lib/auth-security";

export async function GET(request: NextRequest) {
  if (!isAllowedSameOriginAssetRequest(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

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

  if (isTurnstileEnabled()) {
    return NextResponse.json(
      {
        mode: "turnstile",
        siteKey: getTurnstileSiteKey(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const challenge = createHumanChallenge();
  return NextResponse.json(
    {
      mode: "math",
      ...challenge,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
