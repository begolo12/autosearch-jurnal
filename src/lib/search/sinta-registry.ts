import type { SintaTier } from "@/lib/types";

/**
 * Curated ISSN/e-ISSN lookup for flagship Indonesian journals accredited under SINTA 1 & SINTA 2.
 * Used as primary ground-truth before falling back to OpenAlex impact-based SINTA estimation.
 */
const OFFICIAL_SINTA_BY_ISSN = new Map<string, SintaTier>([
  // SINTA 1 — Engineering, Computer Science, Sciences, Medicine, Social Sciences
  ["2086-9614", "SINTA1"], // International Journal of Technology (IJTech, UI)
  ["2406-7954", "SINTA1"], // IJTech e-ISSN
  ["1693-6930", "SINTA1"], // TELKOMNIKA
  ["2302-9293", "SINTA1"], // TELKOMNIKA e-ISSN
  ["2088-8708", "SINTA1"], // International Journal of Electrical and Computer Engineering (IJECE)
  ["2722-2578", "SINTA1"], // IJECE e-ISSN
  ["2088-5334", "SINTA1"], // International Journal on Advanced Science, Engineering and Information Technology (IJASEIT)
  ["2460-6952", "SINTA1"], // IJASEIT e-ISSN
  ["2252-8938", "SINTA1"], // IAES International Journal of Artificial Intelligence (IJ-AI)
  ["2722-3221", "SINTA1"], // IJ-AI e-ISSN
  ["2302-9285", "SINTA1"], // Bulletin of Electrical Engineering and Informatics (BEEI)
  ["2089-3191", "SINTA1"], // BEEI p-ISSN
  ["1411-9420", "SINTA1"], // Indonesian Journal of Chemistry (IJC, UGM)
  ["2460-1578", "SINTA1"], // IJC e-ISSN
  ["1978-2993", "SINTA1"], // Bulletin of Chemical Reaction Engineering & Catalysis (BCREC, UNDIP)
  ["1412-033X", "SINTA1"], // Biodiversitas (UNS)
  ["2085-4722", "SINTA1"], // Biodiversitas e-ISSN
  ["1978-3019", "SINTA1"], // HAYATI Journal of Biosciences (IPB)
  ["2086-4094", "SINTA1"], // HAYATI e-ISSN
  ["0125-9326", "SINTA1"], // Acta Medica Indonesiana
  ["2338-2732", "SINTA1"], // Acta Medica Indonesiana e-ISSN
  ["0853-1773", "SINTA1"], // Medical Journal of Indonesia
  ["2252-8083", "SINTA1"], // Medical Journal of Indonesia e-ISSN
  ["1907-7505", "SINTA1"], // Kesmas: Jurnal Kesehatan Masyarakat Nasional (UI)
  ["2460-0601", "SINTA1"], // Kesmas e-ISSN
  ["1411-1128", "SINTA1"], // Gadjah Mada International Journal of Business (GMJIB)
  ["2338-7238", "SINTA1"], // GMJIB e-ISSN
  ["2301-7341", "SINTA1"], // Indonesian Journal of Applied Linguistics (IJAL, UPI)
  ["2502-6747", "SINTA1"], // IJAL e-ISSN
  ["2339-1286", "SINTA1"], // Jurnal Pendidikan IPA Indonesia (JPII, UNNES)
  ["2089-4392", "SINTA1"], // JPII p-ISSN
  ["2338-8617", "SINTA1"], // Jurnal Ilmiah Peuradeun
  ["2443-2067", "SINTA1"], // Jurnal Ilmiah Peuradeun e-ISSN
  ["2337-5760", "SINTA1"], // Journal of Mathematical and Fundamental Sciences (ITB)
  ["2338-5510", "SINTA1"], // JMFS e-ISSN
  ["2339-1995", "SINTA1"], // Makara Journal of Science (UI)
  ["2356-0851", "SINTA1"], // Makara Journal of Science e-ISSN
  ["2356-4539", "SINTA1"], // Makara Journal of Technology (UI)
  ["2406-789X", "SINTA1"], // Makara Journal of Technology e-ISSN
  ["2086-8219", "SINTA1"], // Journal on Mathematics Education (JME)
  ["2407-0610", "SINTA1"], // JME e-ISSN
  ["2502-8359", "SINTA1"], // Cakrawala Pendidikan (UNY)
  ["2442-8620", "SINTA1"], // Cakrawala Pendidikan e-ISSN
  ["2085-4919", "SINTA1"], // Indonesian Journal of Geography (UGM)
  ["2354-9114", "SINTA1"], // Indonesian Journal of Geography e-ISSN
  ["2088-9089", "SINTA1"], // International Journal of Power Electronics and Drive Systems (IJPEDS)
  ["2722-256X", "SINTA1"], // IJPEDS e-ISSN
  ["2088-8694", "SINTA1"], // International Journal of Advances in Intelligent Informatics (IJAIN)
  ["2548-3161", "SINTA1"], // IJAIN e-ISSN
  ["2443-2601", "SINTA1"], // Indonesian Journal of Biotechnology (UGM)
  ["2089-2241", "SINTA1"], // Indonesian Journal of Biotechnology p-ISSN

  // SINTA 2 — Reputable Indonesian Accredited Journals
  ["2085-1545", "SINTA2"], // Jurnal Ilmu Komputer dan Informasi (JIKI, UI)
  ["2502-9274", "SINTA2"], // JIKI e-ISSN
  ["2443-2555", "SINTA2"], // Journal of Information Systems Engineering and Business Intelligence (JISEBI, UNAIR)
  ["2598-6333", "SINTA2"], // JISEBI e-ISSN
  ["2503-2267", "SINTA2"], // Kinetik: Game Technology, Information System, Computer Network, Computing, Electronics, and Control
  ["2503-2259", "SINTA2"], // Kinetik p-ISSN
  ["2503-0477", "SINTA2"], // Register: Jurnal Ilmiah Teknologi Sistem Informasi
  ["2502-3357", "SINTA2"], // Register p-ISSN
  ["1979-2328", "SINTA2"], // CommIT (Communication and Information Technology) Journal (BINUS)
  ["2460-7010", "SINTA2"], // CommIT e-ISSN
  ["2337-6767", "SINTA2"], // Journal of Indonesian Economy and Business (JIEB, UGM)
  ["2406-9124", "SINTA2"], // JIEB e-ISSN
  ["2088-5806", "SINTA2"], // Jurnal Akuntansi dan Keuangan Indonesia (JAKI, UI)
  ["2406-9701", "SINTA2"], // JAKI e-ISSN
  ["1410-9832", "SINTA2"], // Jurnal Teknologi (Media Teknologi) / ITB Journal
  ["2579-9150", "SINTA2"], // Jurnal Nasional Teknik Elektro dan Teknologi Informasi (JNTETI, UGM)
  ["2301-4156", "SINTA2"], // JNTETI p-ISSN
  ["2477-295X", "SINTA2"], // Jurnal RESTI (Rekayasa Sistem dan Teknologi Informasi)
  ["2580-0760", "SINTA2"], // Jurnal RESTI e-ISSN
  ["2407-1811", "SINTA2"], // JUITA: Jurnal Informatika (UMP)
  ["2579-8901", "SINTA2"], // JUITA e-ISSN
  ["1978-1520", "SINTA2"], // IJCCS (Indonesian Journal of Computing and Cybernetics Systems, UGM)
  ["2460-7258", "SINTA2"], // IJCCS e-ISSN
  ["2089-6050", "SINTA2"], // Jurnal Hukum Ius Quia Iustum (UII)
  ["2527-502X", "SINTA2"], // Jurnal Hukum Ius Quia Iustum e-ISSN
  ["0216-6143", "SINTA2"], // Mimbar Hukum (UGM)
  ["2443-0994", "SINTA2"], // Mimbar Hukum e-ISSN
]);

function normalizeIssn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^0-9X]/g, "");
  if (cleaned.length !== 8) return null;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function lookupOfficialSintaTier(
  issns: Array<string | null | undefined>
): { tier: SintaTier; verified: true } | null {
  for (const raw of issns) {
    const norm = normalizeIssn(raw);
    if (!norm) continue;
    const found = OFFICIAL_SINTA_BY_ISSN.get(norm);
    if (found) {
      return { tier: found, verified: true };
    }
  }
  return null;
}
