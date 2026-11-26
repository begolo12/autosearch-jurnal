import type {
  ConversionMode,
  LiteratureMatrixResult,
  LiteratureMatrixRow,
  PaperChatMessage,
  PaperTakeaways,
  SearchResearchBrief,
} from "@/lib/types";

export class InferHubError extends Error {
  code: "MISSING_API_KEY" | "API_ERROR";
  status?: number;

  constructor(code: InferHubError["code"], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function getInferHubConfig() {
  const apiKey = process.env.INFERHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new InferHubError(
      "MISSING_API_KEY",
      "INFERHUB_API_KEY belum dikonfigurasi di environment variables. Tambahkan API key InferHub di Vercel Dashboard untuk mengaktifkan fitur AI."
    );
  }

  const baseUrl = (
    process.env.INFERHUB_BASE_URL || "https://api.inferhub.dev/v1"
  ).replace(/\/+$/, "");
  const model = process.env.INFERHUB_MODEL || "mv/zai-glm-5-3-flash";

  return { apiKey, baseUrl, model };
}

function getSystemPrompt(mode: ConversionMode): string {
  if (mode === "translate_id") {
    return [
      "Anda adalah editor akademik dan penerjemah jurnal ilmiah multibahasa profesional.",
      "Tugas Anda: deteksi secara otomatis bahasa sumber jurnal (Inggris, Mandarin, Jepang, Korea, Jerman, Prancis, Spanyol, Arab, Rusia, Belanda, atau bahasa lainnya), lalu terjemahkan SELURUH isinya secara akurat ke dalam Bahasa Indonesia akademik yang baku, jernih, dan mudah dibaca.",
      "Format keluaran WAJIB menggunakan Markdown bersih:",
      "- Gunakan `#` untuk judul utama terjemahan, `##` untuk bagian utama (Abstrak, Pendahuluan, Metodologi, Hasil & Pembahasan, Kesimpulan, Daftar Pustaka), dan `###` untuk subbagian.",
      "- Pertahankan istilah teknis/ilmiah penting dalam tanda kurung jika membantu kejelasan.",
      "- Gunakan paragraf utuh, daftar poin (`- `), atau penomoran (`1. `) yang rapi.",
      "- Jangan menyertakan komentar meta atau pembukaan seperti 'Berikut terjemahannya:'. Langsung mulai dengan isi terjemahan.",
    ].join("\n");
  }

  if (mode === "summary_id") {
    return [
      "Anda adalah analis riset akademik senior.",
      "Tugas Anda: baca jurnal dari bahasa apa pun dan buat ringkasan serta tinjauan akademik terstruktur dalam Bahasa Indonesia yang mendalam dan siap dimasukkan ke dokumen Word (.docx).",
      "Gunakan struktur Markdown bersih dengan bagian:",
      "- `## Ringkasan Eksekutif`",
      "- `## Latar Belakang & Masalah Penelitian`",
      "- `## Metodologi`",
      "- `## Temuan Utama & Hasil`",
      "- `## Keterbatasan & Rekomendasi`",
      "- `## Poin Kunci untuk Sitasi` (daftar poin)",
      "Jangan menyertakan kalimat pembuka basa-basi. Langsung hasilkan konten Markdown.",
    ].join("\n");
  }

  return [
    "You are an expert academic document formatter.",
    "Task: reconstruct the extracted PDF journal text into a clean, well-structured, editable Word-ready Markdown document in the paper's original language.",
    "Rules:",
    "- Fix broken line wraps and PDF column artifacts into coherent paragraphs.",
    "- Use `#` for the paper title, `##` for major sections (Abstract, Introduction, Methods, Results, Discussion, Conclusion, References), and `###` for subsections.",
    "- Preserve equations, citations, tables/lists as clean Markdown lists or text.",
    "- Do not add commentary or preambles. Output only the clean structured Markdown document.",
  ].join("\n");
}

function extractJsonObject<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("Format JSON dari AI tidak valid.");
  }
}

async function callInferHubMessages(params: {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ content: string; model: string }> {
  const { apiKey, baseUrl, model } = getInferHubConfig();
  const maxAttempts = 3;
  let lastError: InferHubError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: params.temperature ?? 0.2,
          messages: params.messages,
        }),
        signal: AbortSignal.timeout(params.timeoutMs ?? 45000),
      });

      if (!response.ok) {
        const retryable =
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;
        lastError = new InferHubError(
          "API_ERROR",
          `Layanan AI mengembalikan status ${response.status}. Silakan coba beberapa saat lagi.`,
          response.status
        );
        if (retryable && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        throw lastError;
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
        }>;
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new InferHubError(
          "API_ERROR",
          "Model AI tidak mengembalikan konten."
        );
      }

      return { content, model };
    } catch (err) {
      if (err instanceof InferHubError) {
        throw err;
      }
      lastError = new InferHubError(
        "API_ERROR",
        "Koneksi ke layanan AI terputus atau timeout. Silakan coba lagi."
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw (
    lastError ??
    new InferHubError("API_ERROR", "Gagal menghubungi layanan AI.")
  );
}

async function callInferHub(params: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ content: string; model: string }> {
  return callInferHubMessages({
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    temperature: params.temperature,
    timeoutMs: 50000,
  });
}

export async function generateWordMarkdown(params: {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  abstract: string | null;
  extractedText: string | null;
  mode: ConversionMode;
}): Promise<{ markdown: string; model: string }> {
  const metadataBlock = [
    `Judul: ${params.title}`,
    params.authors.length > 0 ? `Penulis: ${params.authors.join(", ")}` : null,
    params.year ? `Tahun: ${params.year}` : null,
    params.venue ? `Jurnal/Penerbit: ${params.venue}` : null,
    params.doi ? `DOI: ${params.doi}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const sourceContent = params.extractedText
    ? `TEKS LENGKAP PDF:\n${params.extractedText}`
    : `CATATAN: PDF penuh tidak dapat diambil langsung. Gunakan metadata dan abstrak berikut:\n${params.abstract || "Abstrak tidak tersedia."}`;

  const { content, model } = await callInferHub({
    system: getSystemPrompt(params.mode),
    user: `${metadataBlock}\n\n${sourceContent}`,
    temperature: 0.2,
  });

  return { markdown: content, model };
}

export async function translateAbstractToIndonesian(params: {
  title: string;
  abstract: string;
  language?: string | null;
}): Promise<{
  translatedTitle: string;
  translatedAbstract: string;
  model: string;
}> {
  const system = [
    "Anda adalah penerjemah jurnal ilmiah multibahasa.",
    "Deteksi bahasa asli teks (Inggris, Mandarin, Jepang, Jerman, Prancis, Spanyol, Arab, atau bahasa apa pun), lalu terjemahkan judul dan abstrak ke dalam Bahasa Indonesia akademik yang baku dan alami.",
    "Kembalikan HANYA JSON valid dengan format persis: {\"translatedTitle\": \"...\", \"translatedAbstract\": \"...\"}.",
  ].join("\n");

  const user = `Bahasa terindeks: ${params.language || "otomatis"}\nJudul: ${params.title}\nAbstrak: ${params.abstract}`;
  const { content, model } = await callInferHub({
    system,
    user,
    temperature: 0.15,
  });

  try {
    const parsed = extractJsonObject<{
      translatedTitle?: string;
      translatedAbstract?: string;
    }>(content);
    return {
      translatedTitle: parsed.translatedTitle?.trim() || params.title,
      translatedAbstract: parsed.translatedAbstract?.trim() || content,
      model,
    };
  } catch {
    return {
      translatedTitle: params.title,
      translatedAbstract: content,
      model,
    };
  }
}

export async function generateLiteratureMatrix(
  papers: Array<{
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    tierLabel?: string | null;
    abstract: string | null;
  }>
): Promise<LiteratureMatrixResult> {
  const system = [
    "Anda adalah asisten riset akademik senior yang menyusun Matriks Literatur (Literature Review Matrix) dalam Bahasa Indonesia akademik baku.",
    "Analisislah setiap jurnal yang diberikan lalu kembalikan HANYA JSON valid (tanpa markdown code fence) dengan struktur persis:",
    "{",
    '  "synthesis": "paragraf sintesis lintas jurnal (persamaan, tren metode, dan temuan utama bersama)",',
    '  "researchGaps": "paragraf celah penelitian (research gaps) dan peluang riset lanjutan",',
    '  "rows": [',
    '    { "title": "...", "authorsYear": "...", "tier": "...", "objective": "...", "method": "...", "sample": "...", "findings": "...", "limitations": "..." }',
    "  ]",
    "}",
    "Jika informasi tertentu (mis. ukuran sampel) tidak tertulis eksplisit di abstrak, tuliskan singkat berdasarkan konteks atau 'Tidak disebutkan eksplisit di abstrak'.",
  ].join("\n");

  const paperBlocks = papers
    .map((p, idx) => {
      const authorsShort =
        p.authors.length > 0 ? p.authors.slice(0, 3).join(", ") : "Anonim";
      return [
        `[Jurnal ${idx + 1}]`,
        `Judul: ${p.title}`,
        `Penulis & Tahun: ${authorsShort} (${p.year ?? "t.t."})`,
        `Jurnal & Tier: ${p.venue || "-"} (${p.tierLabel || "-"})`,
        `Abstrak: ${p.abstract || "Abstrak tidak tersedia."}`,
      ].join("\n");
    })
    .join("\n\n");

  const { content, model } = await callInferHub({
    system,
    user: `Susun matriks literatur dari ${papers.length} jurnal berikut:\n\n${paperBlocks}`,
    temperature: 0.2,
  });

  const parsed = extractJsonObject<{
    synthesis?: string;
    researchGaps?: string;
    rows?: Partial<LiteratureMatrixRow>[];
  }>(content);

  const rows: LiteratureMatrixRow[] = papers.map((p, idx) => {
    const r = parsed.rows?.[idx] || {};
    return {
      title: r.title || p.title,
      authorsYear:
        r.authorsYear ||
        `${p.authors[0] || "Anonim"} (${p.year ?? "t.t."})`,
      tier: r.tier || p.tierLabel || "-",
      objective: r.objective || "-",
      method: r.method || "-",
      sample: r.sample || "-",
      findings: r.findings || "-",
      limitations: r.limitations || "-",
    };
  });

  return {
    synthesis: parsed.synthesis?.trim() || "Sintesis tidak tersedia.",
    researchGaps:
      parsed.researchGaps?.trim() || "Celah penelitian tidak tersedia.",
    rows,
    model,
  };
}

export async function chatAboutPaper(params: {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract: string | null;
  extractedText: string | null;
  messages: PaperChatMessage[];
}): Promise<{ reply: string; model: string }> {
  const paperContext = [
    `Judul: ${params.title}`,
    params.authors.length > 0 ? `Penulis: ${params.authors.join(", ")}` : null,
    params.year ? `Tahun: ${params.year}` : null,
    params.venue ? `Jurnal: ${params.venue}` : null,
    params.extractedText
      ? `TEKS JURNAL:\n${params.extractedText.slice(0, 26000)}`
      : `ABSTRAK:\n${params.abstract || "Abstrak tidak tersedia."}`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Anda adalah asisten riset AI SmartSari yang membantu pengguna memahami isi jurnal ilmiah.",
    "Jawablah dalam Bahasa Indonesia akademik yang jelas, terstruktur, dan ringkas.",
    "Dasarkan jawaban Anda HANYA pada konteks jurnal di bawah ini. Jika sesuatu tidak terdapat pada teks/abstrak yang tersedia, nyatakan dengan jujur bahwa informasi tersebut tidak tercantum dalam bagian yang tersedia.",
    "",
    paperContext,
  ].join("\n");

  const { content, model } = await callInferHubMessages({
    messages: [
      { role: "system", content: system },
      ...params.messages.slice(-8).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
    temperature: 0.25,
    timeoutMs: 45000,
  });

  return { reply: content, model };
}

export async function generateSearchResearchBrief(params: {
  query: string;
  papers: Array<{
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    tierLabel?: string | null;
    abstract: string | null;
    citations: number | null;
  }>;
}): Promise<SearchResearchBrief> {
  const system = [
    "Anda adalah konsultan riset akademik senior SmartSari.",
    "Tugas Anda: buat ringkasan eksekutif cepat dari kumpulan jurnal hasil pencarian dalam Bahasa Indonesia akademik baku, rujuk artikel dengan tanda [1], [2], dst., serta sarankan 3 kata kunci pencarian lanjutan yang lebih tajam (kombinasi istilah Inggris untuk Q1-Q4 dan Indonesia untuk SINTA).",
    "Kembalikan HANYA JSON valid dengan struktur persis:",
    "{",
    '  "overview": "2-3 kalimat intisari lanskap riset dengan rujukan [1], [2]",',
    '  "keyFindings": ["temuan kunci 1 [1]", "temuan kunci 2 [2]", "temuan kunci 3"],',
    '  "dominantMethods": "1-2 kalimat metode penelitian yang paling banyak dipakai",',
    '  "topRecommendation": "1 kalimat rekomendasi jurnal mana yang paling layak dibaca pertama kali dan alasannya",',
    '  "suggestedQueries": [{ "query": "kata kunci tajam", "label": "Label singkat" }]',
    "}",
  ].join("\n");

  const list = params.papers
    .slice(0, 8)
    .map((p, idx) => {
      const abs = p.abstract ? p.abstract.slice(0, 360) : "Tidak ada abstrak.";
      return `[${idx + 1}] ${p.title} (${p.year ?? "t.t."}, ${p.tierLabel || "-"}, ${p.citations ?? 0} sitasi)\nJurnal: ${p.venue || "-"}\nAbstrak: ${abs}`;
    })
    .join("\n\n");

  const { content, model } = await callInferHub({
    system,
    user: `Kata kunci pencarian: "${params.query}"\n\nDaftar jurnal teratas:\n${list}`,
    temperature: 0.2,
  });

  const parsed = extractJsonObject<Partial<SearchResearchBrief>>(content);
  return {
    overview: parsed.overview?.trim() || "Ringkasan riset tidak tersedia.",
    keyFindings: Array.isArray(parsed.keyFindings)
      ? parsed.keyFindings.filter((k): k is string => Boolean(k)).slice(0, 4)
      : [],
    dominantMethods: parsed.dominantMethods?.trim() || "-",
    topRecommendation: parsed.topRecommendation?.trim() || "-",
    suggestedQueries: Array.isArray(parsed.suggestedQueries)
      ? parsed.suggestedQueries
          .filter((q) => q && typeof q.query === "string" && q.query.trim())
          .slice(0, 3)
      : [],
    model,
  };
}

export async function extractPaperTakeaways(params: {
  title: string;
  abstract: string;
  venue?: string | null;
  year?: number | null;
}): Promise<PaperTakeaways> {
  const system = [
    "Anda adalah analis jurnal ilmiah SmartSari.",
    "Ekstrak 4 poin intisari singkat (masing-masing 1 kalimat padat dalam Bahasa Indonesia akademik baku) dari judul dan abstrak jurnal.",
    "Kembalikan HANYA JSON valid dengan format persis:",
    '{"problem":"...","method":"...","finding":"...","implication":"..."}',
  ].join("\n");

  const user = `Judul: ${params.title}\nJurnal: ${params.venue || "-"} (${params.year ?? "t.t."})\nAbstrak: ${params.abstract}`;
  const { content, model } = await callInferHub({
    system,
    user,
    temperature: 0.15,
  });

  const parsed = extractJsonObject<Partial<PaperTakeaways>>(content);
  return {
    problem: parsed.problem?.trim() || "-",
    method: parsed.method?.trim() || "-",
    finding: parsed.finding?.trim() || "-",
    implication: parsed.implication?.trim() || "-",
    model,
  };
}
