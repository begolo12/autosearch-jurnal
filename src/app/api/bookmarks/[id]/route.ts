import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookmarks } from "@/db/schema";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    await db.delete(bookmarks).where(eq(bookmarks.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/bookmarks/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus bookmark." },
      { status: 500 }
    );
  }
}
