import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { searchHistory } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

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

  const { sessionId, isNew } = getSessionContext(request);
  const { id } = await context.params;
  if (!id || !UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    await db
      .delete(searchHistory)
      .where(
        and(eq(searchHistory.id, id), eq(searchHistory.sessionId, sessionId))
      );
    return attachSessionCookie(NextResponse.json({ ok: true }), sessionId, isNew);
  } catch (err) {
    console.error("DELETE /api/history/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus item riwayat." },
      { status: 500 }
    );
  }
}
