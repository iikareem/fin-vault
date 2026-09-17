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
    swatch: ["#edf4f0", "#065f46", "#075985"],
  },
  {
    id: "dark",
    themeColor: "#0b110f",
    swatch: ["#0b110f", "#059669", "#0284c7"],
    dark: true,
  },
  {
    id: "blue",
    themeColor: "#e7f1f8",
    swatch: ["#e7f1f8", "#0369a1", "#075985"],
  },
  {
    id: "sand",
    themeColor: "#f2efe8",
    swatch: ["#f2efe8", "#a16207", "#b45309"],
  },
  {
    id: "rose",
    themeColor: "#fceef3",
    swatch: ["#fceef3", "#be185d", "#a21caf"],
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
