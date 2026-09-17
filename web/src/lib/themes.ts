export const THEME_IDS = [
  "light",
  "dark",
  "ocean",
  "sand",
  "rose",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeOption = {
  id: ThemeId;
  /** Browser / PWA chrome color */
  themeColor: string;
  /** Swatch preview: background + accent */
  swatch: [string, string];
  dark?: boolean;
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    themeColor: "#edf4f0",
    swatch: ["#edf4f0", "#059669"],
  },
  {
    id: "dark",
    themeColor: "#0b110f",
    swatch: ["#0b110f", "#34d399"],
    dark: true,
  },
  {
    id: "ocean",
    themeColor: "#e7f1f8",
    swatch: ["#e7f1f8", "#0284c7"],
  },
  {
    id: "sand",
    themeColor: "#f2efe8",
    swatch: ["#f2efe8", "#0f766e"],
  },
  {
    id: "rose",
    themeColor: "#fceef3",
    swatch: ["#fceef3", "#db2777"],
  },
];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as readonly string[]).includes(value);
}

export function normalizeTheme(value: string | null | undefined): ThemeId {
  return isThemeId(value) ? value : "light";
}

export function themeMetaColor(theme: ThemeId): string {
  return THEME_OPTIONS.find((t) => t.id === theme)?.themeColor ?? "#edf4f0";
}
