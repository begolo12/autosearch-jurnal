import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";
import { isAllowedAuthOrigin } from "@/lib/auth-security";

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  return clearAuthCookie(
    NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
  );
}
