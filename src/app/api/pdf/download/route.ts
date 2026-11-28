import { NextRequest, NextResponse } from "next/server";
import { isAllowedSameOriginAssetRequest } from "@/lib/auth-security";
import {
  fetchPdfWithFallbacks,
  PdfFetchError,
  sanitizeFilename,
} from "@/lib/pdf";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  if (!isAllowedSameOriginAssetRequest(request)) {
    return NextResponse.json(
      { error: "Akses unduhan PDF dari situs eksternal tidak diizinkan." },
      { status: 403 }
    );
  }

  const rl = await checkRateLimit(request, "pdf_download", 20, 60, true);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: `Batas unduhan PDF tercapai. Coba lagi dalam ${rl.retryAfterSeconds} detik.`,
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

  if (url.length > 2000 || title.length > 300 || (doi && doi.length > 200)) {
    return NextResponse.json(
      { error: "Parameter permintaan PDF tidak valid." },
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
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof PdfFetchError) {
      const status =
        err.code === "INVALID_URL"
          ? 400
          : err.code === "TOO_LARGE"
            ? 413
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
      { error: "Gagal mengunduh PDF dari server sumber.", fallbackUrl: url },
      { status: 502 }
    );
  }
}
