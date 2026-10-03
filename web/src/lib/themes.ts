export const THEME_IDS = [
  "light",
  "dark",
  "blue",
  "sand",
  "rose",
  "mint",
  "slate",
  "grape",
  "amber",
  "forest",
  "midnight",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeOption = {
  id: ThemeId;
  /** Browser / PWA chrome color — matches page background */
  themeColor: string;
  /** Preview: page bg · accent A · accent B */
  swatch: [string, string, string];
  dark?: boolean;
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    themeColor: "#edf4f0",
    swatch: ["#edf4f0", "#065f46", "#075985"],
  },
  {
    id: "dark",
    themeColor: "#06090e",
    swatch: ["#06090e", "#10b981", "#38bdf8"],
    dark: true,
  },
  {
    id: "midnight",
    themeColor: "#0b1020",
    swatch: ["#0b1020", "#818cf8", "#22d3ee"],
    dark: true,
  },
  {
    id: "blue",
    themeColor: "#e7f1f8",
    swatch: ["#e7f1f8", "#0369a1", "#4f46e5"],
  },
  {
    id: "mint",
    themeColor: "#eef8f4",
    swatch: ["#eef8f4", "#0f766e", "#0891b2"],
  },
  {
    id: "forest",
    themeColor: "#eef3ea",
    swatch: ["#eef3ea", "#166534", "#3f6212"],
  },
  {
    id: "sand",
    themeColor: "#f2efe8",
    swatch: ["#f2efe8", "#4d7c0f", "#c2410c"],
  },
  {
    id: "amber",
    themeColor: "#fff8eb",
    swatch: ["#fff8eb", "#b45309", "#c2410c"],
  },
  {
    id: "rose",
    themeColor: "#fff5f8",
    swatch: ["#fff5f8", "#f472b6", "#c084fc"],
  },
  {
    id: "grape",
    themeColor: "#f5f3ff",
    swatch: ["#f5f3ff", "#7c3aed", "#db2777"],
  },
  {
    id: "slate",
    themeColor: "#eef2f6",
    swatch: ["#eef2f6", "#334155", "#0f766e"],
  },
];

const LEGACY: Record<string, ThemeId> = {
  ocean: "blue",
};

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as readonly string[]).includes(value);
}

export function normalizeTheme(value: string | null | undefined): ThemeId {
  if (!value) return "light";
  if (isThemeId(value)) return value;
  return LEGACY[value] ?? "light";
}

export function isDarkTheme(theme: ThemeId) {
  return THEME_OPTIONS.find((t) => t.id === theme)?.dark === true;
}

export function themeMetaColor(theme: ThemeId): string {
  return THEME_OPTIONS.find((t) => t.id === theme)?.themeColor ?? "#edf4f0";
}

export function themeColorMap(): Record<string, string> {
  return Object.fromEntries(
    THEME_OPTIONS.map((t) => [t.id, t.themeColor]),
  );
}
