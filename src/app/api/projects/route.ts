import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks, researchProjects } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";

const MAX_PROJECTS_PER_SESSION = 25;

const projectColumns = {
  id: researchProjects.id,
  name: researchProjects.name,
  description: researchProjects.description,
  color: researchProjects.color,
  createdAt: researchProjects.createdAt,
};

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Nama proyek wajib diisi.").max(80),
  description: z.string().trim().max(240).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export async function GET(request: NextRequest) {
  const { sessionId, isNew, clearStaleAuth } =
    await resolveSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select(projectColumns)
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
      NextResponse.json(
        { projects },
        { headers: { "Cache-Control": "no-store" } }
      ),
      sessionId,
      isNew,
      clearStaleAuth
    );
  } catch (err) {
    console.error("GET /api/projects error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar proyek riset." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit(request, "projects_create", 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { sessionId, isNew, clearStaleAuth } =
    await resolveSessionContext(request);
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
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(researchProjects)
      .where(eq(researchProjects.sessionId, sessionId));

    if ((countRow?.count ?? 0) >= MAX_PROJECTS_PER_SESSION) {
      return NextResponse.json(
        {
          error: `Batas maksimal ${MAX_PROJECTS_PER_SESSION} proyek riset tercapai.`,
        },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(researchProjects)
      .values({
        sessionId,
        name: body.name,
        description: body.description ?? null,
        color: body.color || "#F472B6",
      })
      .returning(projectColumns);

    return attachSessionCookie(
      NextResponse.json(
        { project: { ...created, bookmarkCount: 0 } },
        { status: 201 }
      ),
      sessionId,
      isNew,
      clearStaleAuth
    );
  } catch (err) {
    console.error("POST /api/projects error:", err);
    return NextResponse.json(
      { error: "Gagal membuat proyek riset." },
      { status: 500 }
    );
  }
}
