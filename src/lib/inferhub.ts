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

function getSystemPrompt(mode: ConversionMode): string {
  if (mode === "translate_id") {
    return [
      "Anda adalah editor akademik dan penerjemah jurnal ilmiah profesional.",
      "Tugas Anda: ubah dan terjemahkan isi jurnal berikut ke dalam Bahasa Indonesia akademik yang baku, jelas, akurat, dan terstruktur rapi untuk diekspor ke Microsoft Word (.docx).",
      "Format keluaran WAJIB menggunakan Markdown bersih:",
      "- Gunakan `#` untuk judul utama terjemahan, `##` untuk bagian utama (Abstrak, Pendahuluan, Metodologi, Hasil & Pembahasan, Kesimpulan, Daftar Pustaka), dan `###` untuk subbagian.",
      "- Pertahankan istilah teknis penting dalam tanda kurung jika perlu.",
      "- Gunakan paragraf yang utuh, daftar poin (`- `), atau penomoran (`1. `) yang rapi.",
      "- Jangan menyertakan komentar meta atau pembukaan seperti 'Berikut terjemahannya:'. Langsung mulai dengan isi dokumen.",
    ].join("\n");
  }

  if (mode === "summary_id") {
    return [
      "Anda adalah analis riset akademik senior.",
      "Tugas Anda: buat ringkasan dan tinjauan akademik terstruktur dalam Bahasa Indonesia yang mendalam dan siap dimasukkan ke dokumen Word (.docx).",
      "Gunakan struktur Markdown bersih dengan bagian:",
      "- `## Ringkasan Eksekutif`",
      "- `## Latar Belakang & Masalah Penelitian`",
      "- `## Metodologi`",
      "- `## Temuan Utama & Hasil`",
      "- `## Keterbatasan & Rekomendasi`",
      "- `## Poin Kunci untuk Sitasi` (daftar poin)",
      "Jangan menyertakan kalimat pembuka basa-basi. Langsung hasilkan konten Markdown yang siap cetak.",
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
  const apiKey = process.env.INFERHUB_API_KEY?.trim();
  if (!apiKey) {
    throw new InferHubError(
      "MISSING_API_KEY",
      "INFERHUB_API_KEY belum dikonfigurasi di environment variables. Tambahkan API key InferHub Anda di Vercel Dashboard atau .env.local untuk mengaktifkan konversi AI ke Word."
    );
  }

  const baseUrl = (
    process.env.INFERHUB_BASE_URL || "https://api.inferhub.dev/v1"
  ).replace(/\/+$/, "");
  const model = process.env.INFERHUB_MODEL || "mv/zai-glm-5-3-flash";

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

  const userPrompt = `${metadataBlock}\n\n${sourceContent}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: getSystemPrompt(params.mode) },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(50000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new InferHubError(
      "API_ERROR",
      `InferHub API error (${response.status}): ${errText.slice(0, 240) || "Gagal memproses dokumen"}`,
      response.status
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  const markdown = data.choices?.[0]?.message?.content?.trim();
  if (!markdown) {
    throw new InferHubError(
      "API_ERROR",
      "Model tidak mengembalikan konten dokumen."
    );
  }

  return { markdown, model };
}
