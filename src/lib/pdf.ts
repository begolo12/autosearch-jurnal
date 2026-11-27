import dns from "node:dns/promises";
import net from "node:net";
import { extractText } from "unpdf";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_EXTRACTED_CHARS = 30000;
const MAX_REDIRECT_HOPS = 5;

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

function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(ip);

  if (ipVersion === 4) {
    const parts = ip.split(".").map((n) => Number(n));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 169 && b === 254) return true; // Link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (ipVersion === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(ip)) return true; // Link-local fe80::/10
    if (ip.startsWith("::ffff:")) {
      const mappedV4 = ip.slice(7);
      return isPrivateOrReservedIp(mappedV4);
    }
    return false;
  }

  return false;
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

  if (parsed.username || parsed.password) {
    throw new PdfFetchError(
      "INVALID_URL",
      "URL dengan kredensial tersemat tidak diizinkan."
    );
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    isPrivateOrReservedIp(host)
  ) {
    throw new PdfFetchError(
      "INVALID_URL",
      "Akses ke alamat jaringan internal tidak diizinkan."
    );
  }

  return parsed;
}

async function assertSafeResolvedHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new PdfFetchError(
        "INVALID_URL",
        "Akses ke alamat jaringan internal tidak diizinkan."
      );
    }
    return;
  }

  try {
    const records = await dns.lookup(host, { all: true });
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new PdfFetchError(
          "INVALID_URL",
          "Akses ke alamat jaringan internal tidak diizinkan."
        );
      }
    }
  } catch (err) {
    if (err instanceof PdfFetchError) throw err;
    throw new PdfFetchError(
      "FETCH_FAILED",
      "Gagal memverifikasi host sumber PDF.",
      url.toString()
    );
  }
}

export async function fetchPdfBuffer(rawUrl: string): Promise<Buffer> {
  let currentUrl = validateSafeExternalUrl(rawUrl);
  await assertSafeResolvedHost(currentUrl);

  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    response = await fetch(currentUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });

    if (
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308
    ) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECT_HOPS) {
        throw new PdfFetchError(
          "FETCH_FAILED",
          "Terlalu banyak pengalihan URL saat mengambil PDF.",
          rawUrl
        );
      }
      const nextRaw = new URL(location, currentUrl).toString();
      currentUrl = validateSafeExternalUrl(nextRaw);
      await assertSafeResolvedHost(currentUrl);
      continue;
    }

    break;
  }

  if (!response || !response.ok) {
    throw new PdfFetchError(
      "FETCH_FAILED",
      `Server sumber mengembalikan status ${response?.status ?? 502}. Silakan buka PDF atau halaman sumber secara langsung.`,
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

async function fetchUnpaywallMirrors(doi: string): Promise<string[]> {
  try {
    const clean = doi
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, "");
    if (!clean) return [];

    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(clean)}?email=hello@smartsari.my.id`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      best_oa_location?: { url_for_pdf?: string };
      oa_locations?: Array<{ url_for_pdf?: string }>;
    };

    const urls = new Set<string>();
    if (data.best_oa_location?.url_for_pdf) {
      urls.add(data.best_oa_location.url_for_pdf);
    }
    for (const loc of data.oa_locations ?? []) {
      if (loc.url_for_pdf) urls.add(loc.url_for_pdf);
      if (urls.size >= 3) break;
    }
    return Array.from(urls);
  } catch {
    return [];
  }
}

export async function fetchPdfWithFallbacks(
  primaryUrl: string,
  doi?: string | null
): Promise<Buffer> {
  try {
    return await fetchPdfBuffer(primaryUrl);
  } catch (primaryErr) {
    if (primaryErr instanceof PdfFetchError && primaryErr.code === "INVALID_URL") {
      throw primaryErr;
    }

    if (doi) {
      const mirrors = await fetchUnpaywallMirrors(doi);
      for (const mirror of mirrors) {
        if (mirror === primaryUrl) continue;
        try {
          return await fetchPdfBuffer(mirror);
        } catch {
          // Try next Unpaywall mirror
        }
      }
    }

    throw primaryErr;
  }
}

export async function fetchEuropePmcFullText(
  pdfUrl?: string | null
): Promise<string | null> {
  if (!pdfUrl) return null;
  const match = pdfUrl.match(/PMC\d+/i);
  if (!match) return null;

  const pmcId = match[0].toUpperCase();
  try {
    const res = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcId}/fullTextXML`,
      {
        headers: {
          "User-Agent": "SmartSari/2.0 (mailto:hello@smartsari.my.id)",
        },
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) return null;

    const xml = await res.text();
    const cleaned = xml
      .replace(/<(ref-list|back)[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/(p|title|sec|abstract)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (cleaned.length < 200) return null;
    if (cleaned.length <= MAX_EXTRACTED_CHARS) return cleaned;
    return (
      cleaned.slice(0, MAX_EXTRACTED_CHARS) +
      "\n\n[Catatan: Teks lengkap dipotong karena melebihi batas panjang pemrosesan.]"
    );
  } catch {
    return null;
  }
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
