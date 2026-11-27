import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { researchProjects } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
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
    return NextResponse.json({ error: "ID proyek tidak valid." }, { status: 400 });
  }

  let body: z.infer<typeof patchProjectSchema>;
  try {
    body = patchProjectSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Data pembaruan tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(researchProjects)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      })
      .where(
        and(
          eq(researchProjects.id, id),
          eq(researchProjects.sessionId, sessionId)
        )
      )
      .returning({
        id: researchProjects.id,
        name: researchProjects.name,
        description: researchProjects.description,
        color: researchProjects.color,
        createdAt: researchProjects.createdAt,
      });

    if (!updated) {
      return NextResponse.json(
        { error: "Proyek tidak ditemukan." },
        { status: 404 }
      );
    }

    return attachSessionCookie(
      NextResponse.json({ project: updated }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("PATCH /api/projects/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal memperbarui proyek." },
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
    return NextResponse.json({ error: "ID proyek tidak valid." }, { status: 400 });
  }

  try {
    const db = getDb();
    await db
      .delete(researchProjects)
      .where(
        and(
          eq(researchProjects.id, id),
          eq(researchProjects.sessionId, sessionId)
        )
      );
    return attachSessionCookie(NextResponse.json({ ok: true }), sessionId, isNew);
  } catch (err) {
    console.error("DELETE /api/projects/[id] error:", err);
    return NextResponse.json(
      { error: "Gagal menghapus proyek." },
      { status: 500 }
    );
  }
}
