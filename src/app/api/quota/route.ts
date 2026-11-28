import { NextRequest, NextResponse } from "next/server";
import { getDailyAiQuotaStatus } from "@/lib/quota";
import { attachSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { status, session } = await getDailyAiQuotaStatus(request);
  return attachSessionCookie(
    NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    }),
    session.sessionId,
    session.isNew,
    session.clearStaleAuth
  );
}
