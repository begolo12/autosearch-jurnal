import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { bookmarks } from "@/db/schema";

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

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(bookmarks)
      .orderBy(desc(bookmarks.createdAt))
      .limit(100);
    return NextResponse.json({ bookmarks: rows });
  } catch (err) {
    console.error("GET /api/bookmarks error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar jurnal tersimpan." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
      .where(eq(bookmarks.paperKey, body.paperKey))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ bookmark: existing[0], existed: true });
    }

    const [created] = await db
      .insert(bookmarks)
      .values({
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

    return NextResponse.json({ bookmark: created, existed: false }, { status: 201 });
  } catch (err) {
    console.error("POST /api/bookmarks error:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan jurnal ke database." },
      { status: 500 }
    );
  }
}
