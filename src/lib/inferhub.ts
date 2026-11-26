import type { ConversionMode } from "@/lib/types";

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

async function callInferHub(params: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ content: string; model: string }> {
  const { apiKey, baseUrl, model } = getInferHubConfig();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: params.temperature ?? 0.2,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
    signal: AbortSignal.timeout(50000),
  });

  if (!response.ok) {
    throw new InferHubError(
      "API_ERROR",
      `Layanan AI mengembalikan status ${response.status}. Silakan coba beberapa saat lagi.`,
      response.status
    );
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
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      translatedTitle?: string;
      translatedAbstract?: string;
    };
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
