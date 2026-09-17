export const THEME_IDS = [
  "light",
  "dark",
  "blue",
  "sand",
  "rose",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeOption = {
  id: ThemeId;
  /** Browser / PWA chrome color — matches page background */
  themeColor: string;
  /** Preview: page bg + house + personal */
  swatch: [string, string, string];
  dark?: boolean;
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    themeColor: "#edf4f0",
    /** page · house (green) · personal (blue) */
    swatch: ["#edf4f0", "#065f46", "#075985"],
  },
  {
    id: "dark",
    themeColor: "#06090e",
    /** page · house (mint) · personal (blue) */
    swatch: ["#06090e", "#10b981", "#38bdf8"],
    dark: true,
  },
  {
    id: "blue",
    themeColor: "#e7f1f8",
    /** page · house (ocean) · personal (indigo) */
    swatch: ["#e7f1f8", "#0369a1", "#4f46e5"],
  },
  {
    id: "sand",
    themeColor: "#f2efe8",
    /** page · house (olive) · personal (terracotta) */
    swatch: ["#f2efe8", "#4d7c0f", "#c2410c"],
  },
  {
    id: "rose",
    themeColor: "#fff5f8",
    /** page · house (soft pink) · personal (lilac) */
    swatch: ["#fff5f8", "#f472b6", "#c084fc"],
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

export function themeMetaColor(theme: ThemeId): string {
  return THEME_OPTIONS.find((t) => t.id === theme)?.themeColor ?? "#edf4f0";
}
