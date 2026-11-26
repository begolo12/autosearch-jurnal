import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  attachAuthCookie,
  migrateGuestDataToUser,
  verifyPassword,
} from "@/lib/auth";
import { getGuestSessionId } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().email("Format email tidak valid.").toLowerCase(),
  password: z.string().min(1, "Kata sandi wajib diisi."),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data login tidak valid."
        : "Data login tidak valid.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);

    const user = rows[0];
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Email atau kata sandi salah." },
        { status: 401 }
      );
    }

    const guestId = getGuestSessionId(request);
    if (guestId) {
      try {
        await migrateGuestDataToUser(guestId, `user:${user.id}`);
      } catch (migErr) {
        console.warn("Guest data migration on login failed:", migErr);
      }
    }

    return attachAuthCookie(
      NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      }),
      user.id
    );
  } catch (err) {
    console.error("POST /api/auth/login error:", err);
    return NextResponse.json(
      { error: "Gagal masuk ke akun." },
      { status: 500 }
    );
  }
}
