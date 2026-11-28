import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedAuthOrigin } from "@/lib/auth-security";
import { extractPdfText } from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";
import { attachSessionCookie, resolveSessionContext } from "@/lib/session";

export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB (safe under Vercel 4.5 MB limit)

export async function POST(request: NextRequest) {
  if (!isAllowedAuthOrigin(request)) {
    return NextResponse.json(
      { error: "Permintaan berasal dari sumber yang tidak diizinkan." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rl = await checkRateLimit(request, "pdf_upload", 15, 600, true);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Batas unggah PDF tercapai. Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const session = await resolveSessionContext(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Permintaan unggah berkas tidak valid." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Pilih berkas PDF terlebih dahulu." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (file.size <= 0) {
    return NextResponse.json(
      { error: "Berkas PDF kosong." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Ukuran PDF maksimal 4 MB untuk unggah langsung." },
      { status: 413, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Ukuran PDF maksimal 4 MB untuk unggah langsung." },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!buffer.subarray(0, 5).toString("ascii").startsWith("%PDF-")) {
      return NextResponse.json(
        { error: "Berkas yang diunggah bukan file PDF yang valid." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const extractedText = await extractPdfText(buffer);
    if (!extractedText || extractedText.trim().length < 80) {
      return NextResponse.json(
        {
          error:
            "Teks tidak ditemukan pada PDF ini (kemungkinan berupa gambar hasil pindaian tanpa lapisan teks).",
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    const rawName = (file.name || "Dokumen PDF Pribadi")
      .replace(/\.pdf$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    const title = rawName || "Dokumen PDF Pribadi";

    const hash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex")
      .slice(0, 24);
    const paperKey = `upload:${hash}`;

    return attachSessionCookie(
      NextResponse.json(
        {
          paperKey,
          title,
          extractedText,
          charCount: extractedText.length,
        },
        { headers: { "Cache-Control": "no-store" } }
      ),
      session.sessionId,
      session.isNew,
      session.clearStaleAuth
    );
  } catch (err) {
    console.error("POST /api/pdf/upload error:", err);
    return NextResponse.json(
      { error: "Gagal memproses berkas PDF." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
