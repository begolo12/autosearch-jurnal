import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Pendaftaran wajib melalui verifikasi kode OTP email.",
    },
    { status: 400 }
  );
}
