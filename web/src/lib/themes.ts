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
  /** Swatch preview: house accent + personal accent */
  swatch: [string, string];
  dark?: boolean;
};

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: "light",
    themeColor: "#edf4f0",
    swatch: ["#065f46", "#c2410c"],
  },
  {
    id: "dark",
    themeColor: "#0b110f",
    swatch: ["#059669", "#7c3aed"],
    dark: true,
  },
  {
    id: "ocean",
    themeColor: "#e8f3f1",
    swatch: ["#0f766e", "#0369a1"],
  },
  {
    id: "sand",
    themeColor: "#f2efe8",
    swatch: ["#3f6212", "#b45309"],
  },
  {
    id: "rose",
    themeColor: "#fceef3",
    swatch: ["#be185d", "#7e22ce"],
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
