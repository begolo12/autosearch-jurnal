import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks, researchProjects } from "@/db/schema";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek wajib diisi.").max(80),
  description: z.string().trim().max(240).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function GET(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(researchProjects)
      .where(eq(researchProjects.sessionId, sessionId))
      .orderBy(desc(researchProjects.createdAt))
      .limit(50);

    const counts = await db
      .select({
        projectId: bookmarks.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(bookmarks)
      .where(eq(bookmarks.sessionId, sessionId))
      .groupBy(bookmarks.projectId);

    const countMap = new Map<string, number>();
    for (const c of counts) {
      if (c.projectId) countMap.set(c.projectId, c.count);
    }

    const projects = rows.map((p) => ({
      ...p,
      bookmarkCount: countMap.get(p.id) ?? 0,
    }));

    return attachSessionCookie(
      NextResponse.json({ projects }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar proyek riset." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  let body: z.infer<typeof createProjectSchema>;
  try {
    body = createProjectSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data proyek tidak valid."
        : "Data proyek tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const db = getDb();
    const [created] = await db
      .insert(researchProjects)
      .values({
        sessionId,
        name: body.name,
        description: body.description ?? null,
        color: body.color || "#F472B6",
      })
      .returning();

    return attachSessionCookie(
      NextResponse.json(
        { project: { ...created, bookmarkCount: 0 } },
        { status: 201 }
      ),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return NextResponse.json(
      { error: "Gagal membuat proyek riset." },
      { status: 500 }
    );
  }
}
