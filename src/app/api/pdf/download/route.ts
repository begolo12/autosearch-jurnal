import { NextRequest, NextResponse } from "next/server";
import {
  fetchPdfBuffer,
  PdfFetchError,
  sanitizeFilename,
} from "@/lib/pdf";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const title = request.nextUrl.searchParams.get("title") || "jurnal-akademik";

  if (!url) {
    return NextResponse.json(
      { error: "Parameter URL PDF wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const buffer = await fetchPdfBuffer(url);
    const filename = sanitizeFilename(title, "pdf");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
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
      { error: "Gagal mengunduh PDF dari server sumber.", fallbackUrl: url },
      { status: 502 }
    );
  }
}
