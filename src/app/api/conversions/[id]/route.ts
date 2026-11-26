import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversions } from "@/db/schema";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { sessionId, isNew } = getSessionContext(request);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    await db
      .delete(conversions)
      .where(and(eq(conversions.id, id), eq(conversions.sessionId, sessionId)));
    return attachSessionCookie(NextResponse.json({ ok: true }), sessionId, isNew);
  } catch (err) {
    console.error("DELETE /api/conversions/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus riwayat konversi." },
      { status: 500 }
    );
  }
}
