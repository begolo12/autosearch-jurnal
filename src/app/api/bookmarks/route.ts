import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks } from "@/db/schema";
import { attachSessionCookie, getSessionContext } from "@/lib/session";

const bookmarkSchema = z.object({
  paperKey: z.string().min(1),
  title: z.string().min(1),
  authors: z.array(z.string()).default([]),
  year: z.number().nullable().optional(),
  venue: z.string().nullable().optional(),
  source: z.string().min(1),
  abstract: z.string().nullable().optional(),
  pdfUrl: z.string().nullable().optional(),
  landingUrl: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  citations: z.number().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { sessionId, isNew } = getSessionContext(request);
  try {
    const db = getDb();
    const rows = await db
      .select()
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
    const existing = await db
      .select()
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
      })
      .returning();

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
