import { NextRequest, NextResponse } from "next/server";
import {
  fetchPdfWithFallbacks,
  PdfFetchError,
  sanitizeFilename,
} from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit(request, "pdf_view", 40, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak permintaan PDF. Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  const url = request.nextUrl.searchParams.get("url");
  const title = request.nextUrl.searchParams.get("title") || "jurnal-q1";
  const doi = request.nextUrl.searchParams.get("doi");

  if (!url) {
    return NextResponse.json(
      { error: "Parameter URL PDF wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const buffer = await fetchPdfWithFallbacks(url, doi);
    const filename = sanitizeFilename(title, "pdf");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Frame-Options": "SAMEORIGIN",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof PdfFetchError) {
      const status =
        err.code === "INVALID_URL"
          ? 400
          : err.code === "NOT_A_PDF"
            ? 422
            : 502;
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          fallbackUrl: err.fallbackUrl || url,
        },
        { status }
      );
    }

    return NextResponse.json(
      { error: "Gagal memuat pratinjau PDF dari penerbit.", fallbackUrl: url },
      { status: 502 }
    );
  }
}
