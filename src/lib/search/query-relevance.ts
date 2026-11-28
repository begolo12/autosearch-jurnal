const STOPWORDS = new Set([
  // Indonesian academic / filler stopwords
  "pengaruh",
  "terhadap",
  "hubungan",
  "analisis",
  "efektivitas",
  "evaluasi",
  "studi",
  "kasus",
  "tinjauan",
  "implementasi",
  "penerapan",
  "faktor",
  "pada",
  "dari",
  "yang",
  "dan",
  "atau",
  "untuk",
  "dengan",
  "dalam",
  "oleh",
  "sebagai",
  "tentang",
  "secara",
  "antara",
  "adalah",
  "bagi",
  "terkait",
  // English academic / filler stopwords
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "over",
  "under",
  "are",
  "was",
  "were",
  "effect",
  "effects",
  "impact",
  "study",
  "analysis",
  "review",
  "relationship",
  "between",
  "using",
  "based",
]);

const ID_TO_EN_PHRASES: Array<[RegExp, string]> = [
  [/\bibu\s+hamil\b/gi, "pregnancy"],
  [/\bkehamilan\b/gi, "pregnancy"],
  [/\bhamil\b/gi, "pregnancy"],
  [/\b(dexametason|deksametason)\b/gi, "dexamethasone"],
  [/\bpersalinan\b/gi, "labor delivery"],
  [/\bhipertensi\b/gi, "hypertension"],
  [/\bpreeklamp?sia\b/gi, "preeclampsia"],
  [/\bkortikosteroid\b/gi, "corticosteroid"],
  [/\bparasetamol\b/gi, "paracetamol"],
  [/\bkanker\b/gi, "cancer"],
  [/\bjantung\b/gi, "cardiac heart"],
  [/\bginjal\b/gi, "renal kidney"],
  [/\binfeksi\b/gi, "infection"],
  [/\bvaksin\b/gi, "vaccine"],
  [/\banak\b/gi, "children"],
  [/\bbayi\b/gi, "infant"],
  [/\blansia\b/gi, "elderly"],
  [/\bekonomi\s+digital\b/gi, "digital economy"],
  [/\bumkm\b/gi, "sme"],
];

const ID_FILLER_STRIP =
  /\b(pengaruh|terhadap|hubungan|analisis|efektivitas|evaluasi|studi|kasus|pada|dari|yang|dan|atau|untuk|dengan|dalam|oleh|di|ke|sebagai|tentang)\b/gi;

const TOKEN_SYNONYMS: Record<string, string[]> = {
  hamil: ["hamil", "kehamil", "pregnan", "maternal", "gestat"],
  kehamil: ["hamil", "kehamil", "pregnan", "maternal", "gestat"],
  ibu: ["ibu", "maternal", "pregnan", "mother", "women"],
  persalinan: ["persalinan", "labor", "labour", "delivery", "birth"],
  hipertensi: ["hipertensi", "hypertens"],
  preeklampsi: ["preeklampsi", "preeclamps"],
  kanker: ["kanker", "cancer", "carcinoma", "tumor"],
  jantung: ["jantung", "cardiac", "heart", "coronary"],
  ginjal: ["ginjal", "renal", "kidney"],
  anak: ["anak", "child", "pediatr"],
  bayi: ["bayi", "infant", "neonat"],
  lansia: ["lansia", "elderly", "geriatr"],
  umkm: ["umkm", "sme", "msme", "small medium"],
};

export function isDoiQuery(query: string): boolean {
  return /^((https?:\/\/)?(dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+/i.test(
    query.trim()
  );
}

/**
 * Normalizes Indonesian/English scientific spelling variants into a shared stem.
 * Example: "dexametason", "deksametason", "dexamethasone" -> "dexametason".
 */
export function normalizeAcademicToken(raw: string): string {
  let s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/ks/g, "x")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/ck/g, "k")
    .replace(/ae/g, "e")
    .replace(/oe/g, "e");

  if (s.length >= 6 && (s.endsWith("e") || s.endsWith("s"))) {
    s = s.slice(0, -1);
  }
  return s;
}

export function extractCoreTokens(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  return Array.from(new Set(words));
}

/**
 * Produces an international/English-friendly query for OpenAlex Q1-Q4 and Europe PMC
 * when the user enters an Indonesian research title/phrase.
 */
export function buildInternationalQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed || isDoiQuery(trimmed)) return trimmed;

  let transformed = trimmed;
  let hadIdPattern = ID_FILLER_STRIP.test(trimmed);
  ID_FILLER_STRIP.lastIndex = 0;

  for (const [pattern, replacement] of ID_TO_EN_PHRASES) {
    if (pattern.test(transformed)) {
      hadIdPattern = true;
      pattern.lastIndex = 0;
      transformed = transformed.replace(pattern, replacement);
    }
  }

  if (!hadIdPattern) return trimmed;

  const cleaned = transformed
    .replace(ID_FILLER_STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned : trimmed;
}

export interface QueryRelevanceResult {
  score: number;
  matchedCore: number;
  totalCore: number;
  matchedAnchor: boolean;
}

export function computeQueryRelevance(
  paper: { title: string; abstract?: string | null },
  query: string
): QueryRelevanceResult {
  const titleLower = (paper.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const absLower = (paper.abstract || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const titleWords = titleLower
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map(normalizeAcademicToken);
  const absWords = absLower
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map(normalizeAcademicToken);

  const normQuery = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();

  const coreTokens = extractCoreTokens(query);
  if (coreTokens.length === 0) {
    const exact = normQuery && titleLower.includes(normQuery) ? 1 : 0;
    return { score: exact, matchedCore: exact, totalCore: 0, matchedAnchor: true };
  }

  // Longest non-stopword token is the primary domain anchor (e.g. "dexametason")
  const anchorToken = [...coreTokens].sort((a, b) => b.length - a.length)[0];

  let score = normQuery && titleLower.includes(normQuery) ? 1.5 : 0;
  let matchedCore = 0;
  let matchedAnchor = false;

  for (const token of coreTokens) {
    const normTok = normalizeAcademicToken(token);
    const stemPrefix = normTok.length >= 6 ? normTok.slice(0, 6) : normTok;
    const synonyms = TOKEN_SYNONYMS[token] ?? TOKEN_SYNONYMS[normTok] ?? [];

    const matchesWordList = (list: string[], rawText: string): boolean => {
      if (rawText.includes(token)) return true;
      for (const w of list) {
        if (
          w === normTok ||
          (stemPrefix.length >= 6 && w.startsWith(stemPrefix)) ||
          (normTok.length >= 6 && w.includes(normTok))
        ) {
          return true;
        }
      }
      for (const syn of synonyms) {
        if (rawText.includes(syn)) return true;
      }
      return false;
    };

    const inTitle = matchesWordList(titleWords, titleLower);
    const inAbstract = !inTitle && matchesWordList(absWords, absLower);

    if (inTitle || inAbstract) {
      matchedCore += 1;
      score += inTitle ? 1.2 : 0.65;
      if (token === anchorToken) {
        matchedAnchor = true;
        score += inTitle ? 0.8 : 0.4;
      }
    }
  }

  return {
    score: score / coreTokens.length,
    matchedCore,
    totalCore: coreTokens.length,
    matchedAnchor,
  };
}
