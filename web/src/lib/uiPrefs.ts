export type UiPrefs = {
  /** Start with balances hidden on Home. */
  hideBalances: boolean;
  /** Soften animations and transitions. */
  reduceMotion: boolean;
  /** Tighter spacing across the app shell. */
  compactUi: boolean;
};

export const UI_PREFS_KEY = "fb_ui_prefs";

export const DEFAULT_UI_PREFS: UiPrefs = {
  hideBalances: false,
  reduceMotion: false,
  compactUi: false,
};

export function readUiPrefs(): UiPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_UI_PREFS };
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFS };
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      hideBalances: Boolean(parsed.hideBalances),
      reduceMotion: Boolean(parsed.reduceMotion),
      compactUi: Boolean(parsed.compactUi),
    };
  } catch {
    return { ...DEFAULT_UI_PREFS };
  }
}

export function writeUiPrefs(prefs: UiPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  applyUiPrefs(prefs);
}

export function applyUiPrefs(prefs: UiPrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.toggleAttribute("data-hide-balances", prefs.hideBalances);
  root.toggleAttribute("data-reduce-motion", prefs.reduceMotion);
  root.toggleAttribute("data-compact", prefs.compactUi);
}

export function patchUiPrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next = { ...readUiPrefs(), ...patch };
  writeUiPrefs(next);
  return next;
}
