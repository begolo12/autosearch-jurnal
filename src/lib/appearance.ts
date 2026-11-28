import type { SortOption } from "@/lib/types";

export type ThemePreference = "dark" | "light" | "system";
export type ColorPalette = "rose" | "indigo" | "emerald" | "sky" | "amber";
export type DefaultTierPreset = "all" | "q1" | "q1_q2" | "q1_q4" | "sinta";

export interface AppearancePrefs {
  theme: ThemePreference;
  palette: ColorPalette;
}

export interface SearchDefaultPrefs {
  defaultSort: SortOption;
  defaultPdfOnly: boolean;
  defaultTierPreset: DefaultTierPreset;
}

export const APPEARANCE_STORAGE_KEY = "smartsari:v1:appearance";
export const SEARCH_PREFS_STORAGE_KEY = "smartsari:v1:search_prefs";

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: "dark",
  palette: "rose",
};

export const DEFAULT_SEARCH_PREFS: SearchDefaultPrefs = {
  defaultSort: "relevance",
  defaultPdfOnly: false,
  defaultTierPreset: "all",
};

export const PALETTE_OPTIONS: Array<{
  id: ColorPalette;
  label: string;
  desc: string;
  swatch: string;
}> = [
  {
    id: "rose",
    label: "Mawar",
    desc: "Aksen bawaan SmartSari",
    swatch: "#DB2777",
  },
  {
    id: "indigo",
    label: "Indigo",
    desc: "Nuansa akademik modern",
    swatch: "#4F46E5",
  },
  {
    id: "emerald",
    label: "Zamrud",
    desc: "Segar & fokus riset sains",
    swatch: "#047857",
  },
  {
    id: "sky",
    label: "Biru Langit",
    desc: "Tenang untuk baca panjang",
    swatch: "#0369A1",
  },
  {
    id: "amber",
    label: "Amber",
    desc: "Hangat & editorial klasik",
    swatch: "#B45309",
  },
];

const VALID_THEMES = new Set<ThemePreference>(["dark", "light", "system"]);
const VALID_PALETTES = new Set<ColorPalette>([
  "rose",
  "indigo",
  "emerald",
  "sky",
  "amber",
]);
const VALID_SORTS = new Set<SortOption>([
  "relevance",
  "impact",
  "newest",
  "citations",
]);
const VALID_TIERS = new Set<DefaultTierPreset>([
  "all",
  "q1",
  "q1_q2",
  "q1_q4",
  "sinta",
]);

export function getStoredAppearance(): AppearancePrefs {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    const theme =
      parsed.theme && VALID_THEMES.has(parsed.theme)
        ? parsed.theme
        : DEFAULT_APPEARANCE.theme;
    const palette =
      parsed.palette && VALID_PALETTES.has(parsed.palette)
        ? parsed.palette
        : DEFAULT_APPEARANCE.palette;
    return { theme, palette };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function resolveTheme(theme: ThemePreference): "dark" | "light" {
  if (theme === "dark" || theme === "light") return theme;
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

export function getActiveResolvedTheme(): "dark" | "light" {
  if (typeof document !== "undefined") {
    return document.documentElement.dataset.theme === "light"
      ? "light"
      : "dark";
  }
  return "dark";
}

export function applyAppearanceToDom(prefs: AppearancePrefs): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(prefs.theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.palette = prefs.palette;
  const metaTheme = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (metaTheme) {
    metaTheme.content = resolved === "light" ? "#F8FAFC" : "#0E0F12";
  }
}

export function saveAppearance(prefs: AppearancePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
  applyAppearanceToDom(prefs);
  window.dispatchEvent(
    new CustomEvent("smartsari:appearance-changed", { detail: prefs })
  );
}

export function getStoredSearchPrefs(): SearchDefaultPrefs {
  if (typeof window === "undefined") return DEFAULT_SEARCH_PREFS;
  try {
    const raw = window.localStorage.getItem(SEARCH_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_SEARCH_PREFS;
    const parsed = JSON.parse(raw) as Partial<SearchDefaultPrefs>;
    return {
      defaultSort:
        parsed.defaultSort && VALID_SORTS.has(parsed.defaultSort)
          ? parsed.defaultSort
          : DEFAULT_SEARCH_PREFS.defaultSort,
      defaultPdfOnly:
        typeof parsed.defaultPdfOnly === "boolean"
          ? parsed.defaultPdfOnly
          : DEFAULT_SEARCH_PREFS.defaultPdfOnly,
      defaultTierPreset:
        parsed.defaultTierPreset && VALID_TIERS.has(parsed.defaultTierPreset)
          ? parsed.defaultTierPreset
          : DEFAULT_SEARCH_PREFS.defaultTierPreset,
    };
  } catch {
    return DEFAULT_SEARCH_PREFS;
  }
}

export function saveSearchPrefs(prefs: SearchDefaultPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SEARCH_PREFS_STORAGE_KEY,
      JSON.stringify(prefs)
    );
  } catch {
    // Ignore storage quota errors
  }
}

export const APPEARANCE_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY
)});var p=raw?JSON.parse(raw):{};var t=p.theme==="light"||p.theme==="dark"||p.theme==="system"?p.theme:"dark";var r=t==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):t;var c=p.palette==="rose"||p.palette==="indigo"||p.palette==="emerald"||p.palette==="sky"||p.palette==="amber"?p.palette:"rose";document.documentElement.dataset.theme=r;document.documentElement.dataset.palette=c;}catch(e){}})();`;
