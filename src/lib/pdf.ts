import { extractText } from "unpdf";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_EXTRACTED_CHARS = 30000;

export class PdfFetchError extends Error {
  code: "INVALID_URL" | "FETCH_FAILED" | "NOT_A_PDF" | "TOO_LARGE";
  fallbackUrl?: string;

  constructor(
    code: PdfFetchError["code"],
    message: string,
    fallbackUrl?: string
  ) {
    super(message);
    this.code = code;
    this.fallbackUrl = fallbackUrl;
  }
}

export function validateSafeExternalUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PdfFetchError("INVALID_URL", "URL PDF tidak valid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PdfFetchError(
      "INVALID_URL",
      "Hanya protokol HTTP/HTTPS yang diizinkan."
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  ) {
    throw new PdfFetchError(
      "INVALID_URL",
      "Akses ke alamat jaringan internal tidak diizinkan."
    );
  }

  return parsed;
}

export async function fetchPdfBuffer(rawUrl: string): Promise<Buffer> {
  const parsedUrl = validateSafeExternalUrl(rawUrl);

  const response = await fetch(parsedUrl.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new PdfFetchError(
      "FETCH_FAILED",
      `Server sumber mengembalikan status ${response.status}. Silakan buka halaman sumber secara langsung.`,
      rawUrl
    );
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_PDF_BYTES) {
    throw new PdfFetchError(
      "TOO_LARGE",
      "Ukuran PDF melebihi batas 25 MB.",
      rawUrl
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
    throw new PdfFetchError(
      "TOO_LARGE",
      "Ukuran PDF melebihi batas 25 MB.",
      rawUrl
    );
  }

  const buffer = Buffer.from(arrayBuffer);
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const headerMagic = buffer.subarray(0, 5).toString("ascii");

  if (!headerMagic.startsWith("%PDF-") && !contentType.includes("application/pdf")) {
    throw new PdfFetchError(
      "NOT_A_PDF",
      "Tautan ini mengarah ke halaman web penerbit, bukan berkas PDF langsung. Anda dapat membukanya di tab baru.",
      response.url || rawUrl
    );
  }

  return buffer;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const result = await extractText(uint8, { mergePages: true });
  const rawText = Array.isArray(result.text)
    ? result.text.join("\n\n")
    : String(result.text ?? "");

  const cleaned = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (cleaned.length <= MAX_EXTRACTED_CHARS) {
    return cleaned;
  }

  return (
    cleaned.slice(0, MAX_EXTRACTED_CHARS) +
    "\n\n[Catatan: Teks PDF dipotong karena melebihi batas panjang pemrosesan.]"
  );
}

export function sanitizeFilename(title: string, ext: string): string {
  const base = title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 72);
  return `${base || "jurnal-akademik"}.${ext}`;
}
