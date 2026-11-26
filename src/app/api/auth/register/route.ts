import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  attachAuthCookie,
  hashPassword,
  migrateGuestDataToUser,
} from "@/lib/auth";
import { getGuestSessionId } from "@/lib/session";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  email: z.string().trim().email("Format email tidak valid.").toLowerCase(),
  password: z.string().min(6, "Kata sandi minimal 6 karakter.").max(128),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof registerSchema>;
  try {
    body = registerSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data pendaftaran tidak valid."
        : "Data pendaftaran tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const db = getDb();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Email ini sudah terdaftar. Silakan masuk." },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        passwordHash: hashPassword(body.password),
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
      });

    const guestId = getGuestSessionId(request);
    if (guestId) {
      try {
        await migrateGuestDataToUser(guestId, `user:${created.id}`);
      } catch (migErr) {
        console.warn("Guest data migration on register failed:", migErr);
      }
    }

    return attachAuthCookie(
      NextResponse.json({ user: created }, { status: 201 }),
      created.id
    );
  } catch (err) {
    console.error("POST /api/auth/register error:", err);
    return NextResponse.json(
      { error: "Gagal membuat akun. Silakan coba lagi." },
      { status: 500 }
    );
  }
}
