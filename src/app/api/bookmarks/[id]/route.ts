import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks } from "@/db/schema";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

const patchBookmarkSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { sessionId, isNew } = getSessionContext(request);
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }

  let body: z.infer<typeof patchBookmarkSchema>;
  try {
    body = patchBookmarkSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Data pembaruan bookmark tidak valid." },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(bookmarks)
      .set({
        ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      })
      .where(and(eq(bookmarks.id, id), eq(bookmarks.sessionId, sessionId)))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Bookmark tidak ditemukan." },
        { status: 404 }
      );
    }

    return attachSessionCookie(
      NextResponse.json({ bookmark: updated }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("PATCH /api/bookmarks/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui bookmark." },
      { status: 500 }
    );
  }
}

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
      .delete(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.sessionId, sessionId)));
    return attachSessionCookie(NextResponse.json({ ok: true }), sessionId, isNew);
  } catch (err) {
    console.error("DELETE /api/bookmarks/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus bookmark." },
      { status: 500 }
    );
  }
}
