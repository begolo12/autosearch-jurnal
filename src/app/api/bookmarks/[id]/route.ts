import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks, researchProjects } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchBookmarkSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
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
    if (body.projectId) {
      const ownedProject = await db
        .select({ id: researchProjects.id })
        .from(researchProjects)
        .where(
          and(
            eq(researchProjects.id, body.projectId),
            eq(researchProjects.sessionId, sessionId)
          )
        )
        .limit(1);
      if (ownedProject.length === 0) {
        return NextResponse.json(
          { error: "Proyek tidak ditemukan." },
          { status: 404 }
        );
      }
    }

    const [updated] = await db
      .update(bookmarks)
      .set({
        ...(body.projectId !== undefined ? { projectId: body.projectId } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      })
      .where(and(eq(bookmarks.id, id), eq(bookmarks.sessionId, sessionId)))
      .returning({
        id: bookmarks.id,
        paperKey: bookmarks.paperKey,
        title: bookmarks.title,
        authors: bookmarks.authors,
        year: bookmarks.year,
        venue: bookmarks.venue,
        source: bookmarks.source,
        abstract: bookmarks.abstract,
        pdfUrl: bookmarks.pdfUrl,
        landingUrl: bookmarks.landingUrl,
        doi: bookmarks.doi,
        citations: bookmarks.citations,
        projectId: bookmarks.projectId,
        note: bookmarks.note,
        tierLabel: bookmarks.tierLabel,
        createdAt: bookmarks.createdAt,
      });

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
