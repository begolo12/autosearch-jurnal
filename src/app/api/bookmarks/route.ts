import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks, researchProjects } from "@/db/schema";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

const bookmarkColumns = {
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
};

const bookmarkSchema = z.object({
  paperKey: z.string().min(1).max(300),
  title: z.string().min(1).max(500),
  authors: z.array(z.string().max(160)).max(50).default([]),
  year: z.number().nullable().optional(),
  venue: z.string().max(300).nullable().optional(),
  source: z.string().min(1).max(40),
  abstract: z.string().max(15000).nullable().optional(),
  pdfUrl: z.string().max(1000).nullable().optional(),
  landingUrl: z.string().max(1000).nullable().optional(),
  doi: z.string().max(200).nullable().optional(),
  citations: z.number().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  tierLabel: z.string().max(40).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select(bookmarkColumns)
      .from(bookmarks)
      .where(eq(bookmarks.sessionId, sessionId))
      .orderBy(desc(bookmarks.createdAt))
      .limit(100);
    return attachSessionCookie(
      NextResponse.json({ bookmarks: rows }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("GET /api/bookmarks error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar jurnal tersimpan." },
      { status: 500 }
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

  const rl = await checkRateLimit(request, "bookmarks_create", 60, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Terlalu banyak permintaan. Tunggu ${rl.retryAfterSeconds} detik.` },
      { status: 429 }
    );
  }

  const { sessionId, isNew } = getSessionContext(request);

  let body: z.infer<typeof bookmarkSchema>;
  try {
    body = bookmarkSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Data jurnal tidak valid." },
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

    const existing = await db
      .select(bookmarkColumns)
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.sessionId, sessionId),
          eq(bookmarks.paperKey, body.paperKey)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return attachSessionCookie(
        NextResponse.json({ bookmark: existing[0], existed: true }),
        sessionId,
        isNew
      );
    }

    const [created] = await db
      .insert(bookmarks)
      .values({
        sessionId,
        paperKey: body.paperKey,
        title: body.title,
        authors: body.authors,
        year: body.year ?? null,
        venue: body.venue ?? null,
        source: body.source,
        abstract: body.abstract ?? null,
        pdfUrl: body.pdfUrl ?? null,
        landingUrl: body.landingUrl ?? null,
        doi: body.doi ?? null,
        citations: body.citations ?? null,
        projectId: body.projectId ?? null,
        note: body.note ?? null,
        tierLabel: body.tierLabel ?? null,
      })
      .returning(bookmarkColumns);

    return attachSessionCookie(
      NextResponse.json({ bookmark: created, existed: false }, { status: 201 }),
      sessionId,
      isNew
    );
  } catch (err) {
    console.error("POST /api/bookmarks error:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan jurnal ke database." },
      { status: 500 }
    );
  }
}
