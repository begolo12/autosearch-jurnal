import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkAuthRateLimit,
  getAuthClientIpHash,
  getTrustedClientIp,
  isAllowedAuthOrigin,
  isDisposableEmail,
  verifyHumanVerification,
} from "@/lib/auth-security";
import { sendContactMessageEmail } from "@/lib/email";

const CATEGORY_LABELS: Record<
  "bantuan" | "hapus_akun" | "masukan" | "lainnya",
  string
> = {
  bantuan: "Bantuan Teknis",
  hapus_akun: "Permintaan Hapus Akun (UU PDP)",
  masukan: "Saran & Masukan",
  lainnya: "Lainnya",
};

const contactSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  email: z.string().trim().email("Format email tidak valid.").max(160).toLowerCase(),
  category: z.enum(["bantuan", "hapus_akun", "masukan", "lainnya"]),
  message: z
    .string()
    .trim()
    .min(10, "Pesan minimal 10 karakter.")
    .max(2000, "Pesan maksimal 2000 karakter."),
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
  challengeToken: z.string().max(512).optional(),
  challengeAnswer: z.string().trim().max(16).optional(),
});

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const ipHash = getAuthClientIpHash(request);
  const [globalRl, ipRl] = await Promise.all([
    checkAuthRateLimit("contact_global", 30, 600),
    checkAuthRateLimit(`contact_ip:${ipHash}`, 3, 3600),
  ]);

  if (!globalRl.allowed || !ipRl.allowed) {
    const retryAfter = Math.max(
      globalRl.allowed ? 0 : globalRl.retryAfterSeconds,
      ipRl.allowed ? 0 : ipRl.retryAfterSeconds,
      60
    );
    return NextResponse.json(
      {
        error: `Terlalu banyak pesan dikirim. Silakan tunggu ${Math.ceil(
          retryAfter / 60
        )} menit lagi.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  let body: z.infer<typeof contactSchema>;
  try {
    body = contactSchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message || "Data formulir kontak tidak valid."
        : "Data formulir kontak tidak valid.";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json(
      { error: "Permintaan ditolak oleh filter keamanan." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (isDisposableEmail(body.email)) {
    return NextResponse.json(
      {
        error:
          "Email sementara (disposable) tidak diizinkan. Gunakan email aktif untuk menerima balasan.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const challengeCheck = await verifyHumanVerification({
    turnstileToken: body.turnstileToken,
    challengeToken: body.challengeToken,
    challengeAnswer: body.challengeAnswer,
    remoteIp: getTrustedClientIp(request),
    minElapsedMs: 2000,
  });
  if (!challengeCheck.ok) {
    return NextResponse.json(
      { error: challengeCheck.reason },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const inbox = process.env.CONTACT_INBOX_EMAIL?.trim();
  if (!inbox) {
    return NextResponse.json(
      { error: "Saluran kontak sementara belum dikonfigurasi." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const mailResult = await sendContactMessageEmail({
    to: inbox,
    fromName: body.name,
    fromEmail: body.email,
    category: CATEGORY_LABELS[body.category],
    message: body.message,
  });

  if (!mailResult.ok) {
    return NextResponse.json(
      { error: mailResult.error },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
