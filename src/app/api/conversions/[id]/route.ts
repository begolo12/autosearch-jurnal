import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit(request, "conversions_mutate", 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { sessionId, isNew, clearStaleAuth } =
    await resolveSessionContext(request);
  const { id } = await context.params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    await db
      .delete(conversions)
      .where(and(eq(conversions.id, id), eq(conversions.sessionId, sessionId)));
    return attachSessionCookie(
      NextResponse.json({ ok: true }),
      sessionId,
      isNew,
      clearStaleAuth
    );
  } catch (err) {
    console.error("DELETE /api/conversions/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus riwayat konversi." },
      { status: 500 }
    );
  }
}
