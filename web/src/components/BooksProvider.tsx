"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_REQUIRED, api } from "@/lib/api";
import { HOUSE_BOOKS_ENABLED } from "@/lib/features";
import { DEFAULT_LOCALE, LANG_KEY, personLabel, type Locale } from "@/lib/i18n";
import {
  isOfflineNetworkError,
  isLikelyOffline,
  loadSessionCache,
  saveSessionCache,
} from "@/lib/offline-queue";
import {
  isPersonalOnly,
  loadSpace,
  setActiveSpace,
  type Space,
} from "@/lib/space";
import {
  appleStatusBarStyle,
  isDarkTheme,
  normalizeTheme,
  themeMetaColor,
  type ThemeId,
} from "@/lib/themes";
import {
  applyUiPrefs,
  readUiPrefs,
  writeUiPrefs,
  type UiPrefs,
} from "@/lib/uiPrefs";
import { useI18n } from "./I18nProvider";

export type ThemeMode = ThemeId;

type AccountUiPrefs = UiPrefs & {
  showPersonalMonthSpend: boolean;
  locale: Locale;
};

type PreferencePatch = {
  preferredCurrency?: string;
  theme?: ThemeMode;
  budgetMonthStartDay?: number;
  showPersonalMonthSpend?: boolean;
  hideBalances?: boolean;
  reduceMotion?: boolean;
  compactUi?: boolean;
  locale?: Locale;
};

type PreferenceResponse = {
  preferredCurrency: string;
  theme: string;
  budgetMonthStartDay: number;
  showPersonalMonthSpend: boolean;
  hideBalances: boolean;
  reduceMotion: boolean;
  compactUi: boolean;
  locale: string;
};

const PREFS_SEEDED_KEY = "fb_account_ui_prefs_seeded";

function setMetaContent(name: string, content: string) {
  const nodes = document.querySelectorAll(`meta[name="${name}"]`);
  if (!nodes.length) {
    const el = document.createElement("meta");
    el.setAttribute("name", name);
    el.setAttribute("content", content);
    document.head.appendChild(el);
    return;
  }
  nodes.forEach((node) => {
    if (node.getAttribute("content") !== content) {
      node.setAttribute("content", content);
    }
  });
}

function normalizeLocale(value?: string | null): Locale {
  return value === "ar" ? "ar" : "en";
}

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "ar" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

function wasUiPrefsSeeded(userId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(PREFS_SEEDED_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(map[userId]);
  } catch {
    return false;
  }
}

function markUiPrefsSeeded(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PREFS_SEEDED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[userId] = true;
    localStorage.setItem(PREFS_SEEDED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function isServerUiPrefsPristine(prefs: AccountUiPrefs): boolean {
  return (
    !prefs.hideBalances &&
    !prefs.reduceMotion &&
    !prefs.compactUi &&
    !prefs.showPersonalMonthSpend &&
    prefs.locale === "en"
  );
}

type BooksValue = {
  userId: string;
  /** English canonical name from the API. */
  name: string;
  nameAr: string;
  /** Locale-aware display name for greetings and profile. */
  displayName: string;
  house: Space | null;
  personal: Space | null;
  active: Space | null;
  loading: boolean;
  /** Hide house switch / house routes for this user. */
  personalOnly: boolean;
  preferredCurrency: string;
  theme: ThemeMode;
  /** Personal budget period start day (1–28). Ignored for House books. */
  budgetMonthStartDay: number;
  /** Show this-month income/spend tiles in the personal Home money box. */
  showPersonalMonthSpend: boolean;
  hideBalances: boolean;
  reduceMotion: boolean;
  compactUi: boolean;
  setKind: (kind: "HOUSE" | "PERSONAL") => void;
  refreshSpaces: () => Promise<void>;
  setPreferences: (prefs: PreferencePatch) => Promise<void>;
};

const BooksContext = createContext<BooksValue | null>(null);

const HOUSE_ONLY = ["/between", "/family", "/charity", "/more", "/with-house"];
const PERSONAL_ONLY = ["/gold", "/outside-loans", "/travels"];

const THEME_KEY = "fb_theme";

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    return normalizeTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = isDarkTheme(theme);
  if (root.getAttribute("data-theme") !== theme) {
    root.setAttribute("data-theme", theme);
  }
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  const color = themeMetaColor(theme);
  root.style.backgroundColor = color;
  setMetaContent("theme-color", color);
  setMetaContent(
    "apple-mobile-web-app-status-bar-style",
    appleStatusBarStyle(theme),
  );
}

function accountUiFromMe(me: {
  showPersonalMonthSpend?: boolean;
  hideBalances?: boolean;
  reduceMotion?: boolean;
  compactUi?: boolean;
  locale?: string;
}): AccountUiPrefs {
  return {
    showPersonalMonthSpend: Boolean(me.showPersonalMonthSpend),
    hideBalances: Boolean(me.hideBalances),
    reduceMotion: Boolean(me.reduceMotion),
    compactUi: Boolean(me.compactUi),
    locale: normalizeLocale(me.locale),
  };
}

export function BooksProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { locale, setLocale } = useI18n();
  const onAuthPage = path === "/login" || path === "/register";
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [house, setHouse] = useState<Space | null>(null);
  const [personal, setPersonal] = useState<Space | null>(null);
  const [active, setActive] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [personalOnly, setPersonalOnly] = useState(!HOUSE_BOOKS_ENABLED);
  const [preferredCurrency, setPreferredCurrency] = useState("EGP");
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme);
  const [budgetMonthStartDay, setBudgetMonthStartDay] = useState(1);
  const [showPersonalMonthSpend, setShowPersonalMonthSpend] = useState(false);
  const [hideBalances, setHideBalances] = useState(
    () => readUiPrefs().hideBalances,
  );
  const [reduceMotion, setReduceMotion] = useState(
    () => readUiPrefs().reduceMotion,
  );
  const [compactUi, setCompactUi] = useState(() => readUiPrefs().compactUi);
  const seedingRef = useRef(false);

  const applyAccountUiPrefs = useCallback(
    (prefs: AccountUiPrefs) => {
      setShowPersonalMonthSpend(prefs.showPersonalMonthSpend);
      setHideBalances(prefs.hideBalances);
      setReduceMotion(prefs.reduceMotion);
      setCompactUi(prefs.compactUi);
      writeUiPrefs({
        hideBalances: prefs.hideBalances,
        reduceMotion: prefs.reduceMotion,
        compactUi: prefs.compactUi,
      });
      setLocale(prefs.locale);
    },
    [setLocale],
  );

  const applyMe = useCallback(
    (
      me: {
        id: string;
        name: string;
        nameAr?: string;
        preferredCurrency?: string;
        theme?: string;
        budgetMonthStartDay?: number;
        showPersonalMonthSpend?: boolean;
        hideBalances?: boolean;
        reduceMotion?: boolean;
        compactUi?: boolean;
        locale?: string;
        spaces: Space[];
        space: Space | null;
        personalOnly?: boolean;
      },
      opts?: { skipUiPrefs?: boolean },
    ) => {
      setUserId(me.id);
      setName(me.name);
      setNameAr(me.nameAr?.trim() || "");
      const h = me.spaces.find((s) => s.kind === "HOUSE") ?? null;
      const p = me.spaces.find((s) => s.kind === "PERSONAL") ?? null;
      const only =
        !HOUSE_BOOKS_ENABLED ||
        (me.personalOnly ?? isPersonalOnly(me.spaces));
      setHouse(h);
      setPersonal(p);
      setPersonalOnly(only);
      const nextActive =
        only && me.space?.kind === "HOUSE" ? (p ?? me.space) : me.space;
      if (nextActive && nextActive !== me.space) {
        setActiveSpace(nextActive.householdId);
      }
      setActive(nextActive ?? p ?? (!only ? h : null));
      const nextTheme = normalizeTheme(me.theme);
      setTheme((prev) => (prev === nextTheme ? prev : nextTheme));
      applyTheme(nextTheme);
      setPreferredCurrency(me.preferredCurrency ?? p?.currency ?? "EGP");
      setBudgetMonthStartDay(
        Math.min(28, Math.max(1, me.budgetMonthStartDay ?? 1)),
      );
      if (!opts?.skipUiPrefs) {
        applyAccountUiPrefs(accountUiFromMe(me));
      } else {
        setShowPersonalMonthSpend(Boolean(me.showPersonalMonthSpend));
      }
    },
    [applyAccountUiPrefs],
  );

  const applyPreferenceResponse = useCallback(
    (res: PreferenceResponse) => {
      const nextTheme = normalizeTheme(res.theme);
      setTheme(nextTheme);
      applyTheme(nextTheme);
      setPreferredCurrency(res.preferredCurrency);
      setBudgetMonthStartDay(
        Math.min(28, Math.max(1, res.budgetMonthStartDay ?? 1)),
      );
      applyAccountUiPrefs(accountUiFromMe(res));
    },
    [applyAccountUiPrefs],
  );

  const maybeSeedLocalUiPrefs = useCallback(
    async (me: {
      id: string;
      showPersonalMonthSpend?: boolean;
      hideBalances?: boolean;
      reduceMotion?: boolean;
      compactUi?: boolean;
      locale?: string;
    }): Promise<AccountUiPrefs> => {
      const server = accountUiFromMe(me);
      if (typeof window === "undefined" || seedingRef.current) {
        applyAccountUiPrefs(server);
        return server;
      }
      if (wasUiPrefsSeeded(me.id)) {
        applyAccountUiPrefs(server);
        return server;
      }

      const localUi = readUiPrefs();
      const localLocale = readStoredLocale();
      const localDiffers =
        localUi.hideBalances ||
        localUi.reduceMotion ||
        localUi.compactUi ||
        localLocale !== "en";

      if (isServerUiPrefsPristine(server) && localDiffers) {
        seedingRef.current = true;
        try {
          const res = await api<PreferenceResponse>("/auth/preferences", {
            method: "PATCH",
            body: JSON.stringify({
              hideBalances: localUi.hideBalances,
              reduceMotion: localUi.reduceMotion,
              compactUi: localUi.compactUi,
              locale: localLocale,
            }),
          });
          const next = accountUiFromMe(res);
          applyPreferenceResponse(res);
          markUiPrefsSeeded(me.id);
          return next;
        } catch {
          // Keep current device prefs; retry seed on a later session.
          applyUiPrefs(localUi);
          return {
            showPersonalMonthSpend: server.showPersonalMonthSpend,
            hideBalances: localUi.hideBalances,
            reduceMotion: localUi.reduceMotion,
            compactUi: localUi.compactUi,
            locale: localLocale,
          };
        } finally {
          seedingRef.current = false;
        }
      }

      applyAccountUiPrefs(server);
      markUiPrefsSeeded(me.id);
      return server;
    },
    [applyAccountUiPrefs, applyPreferenceResponse],
  );

  const refreshSpaces = useCallback(async () => {
    try {
      const me = await loadSpace();
      applyMe(me, { skipUiPrefs: true });
      const ui = await maybeSeedLocalUiPrefs(me);
      saveSessionCache({ ...me, ...ui });
    } catch (err) {
      if (isOfflineNetworkError(err) || isLikelyOffline()) {
        const cached = loadSessionCache();
        if (cached) {
          applyMe(cached);
          return;
        }
      }
      throw err;
    }
  }, [applyMe, maybeSeedLocalUiPrefs]);

  useEffect(() => {
    applyUiPrefs(readUiPrefs());
  }, []);

  useEffect(() => {
    // Boot script already painted the saved theme; keep React state aligned
    // without forcing "light" over it (that caused a visible color flash).
    const stored = readStoredTheme();
    setTheme((prev) => (prev === stored ? prev : stored));
    applyTheme(stored);

    if (onAuthPage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Restore last session immediately so offline UI has active space
    // before /auth/me fails or times out.
    const cached = loadSessionCache();
    if (cached) {
      applyMe(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    loadSpace()
      .then(async (me) => {
        if (cancelled) return;
        applyMe(me, { skipUiPrefs: true });
        const ui = await maybeSeedLocalUiPrefs(me);
        if (cancelled) return;
        saveSessionCache({ ...me, ...ui });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && err.message === AUTH_REQUIRED) {
          router.replace("/login");
          return;
        }
        if (isOfflineNetworkError(err) || isLikelyOffline()) {
          const again = loadSessionCache();
          if (again) {
            applyMe(again);
            return;
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onAuthPage, router, applyMe, maybeSeedLocalUiPrefs]);

  useEffect(() => {
    if (loading || onAuthPage || !personalOnly) return;
    if (HOUSE_ONLY.some((p) => path.startsWith(p))) {
      router.replace("/");
    }
  }, [loading, onAuthPage, personalOnly, path, router]);

  const setKind = useCallback(
    (kind: "HOUSE" | "PERSONAL") => {
      if (kind === "HOUSE" && personalOnly) return;
      const next = kind === "HOUSE" ? house : personal;
      if (!next) return;
      setActiveSpace(next.householdId);
      setActive(next);
      if (kind === "PERSONAL" && HOUSE_ONLY.some((p) => path.startsWith(p))) {
        router.push("/");
      }
      if (kind === "HOUSE" && PERSONAL_ONLY.some((p) => path.startsWith(p))) {
        router.push("/");
      }
    },
    [house, personal, personalOnly, path, router],
  );

  const setPreferences = useCallback(
    async (prefs: PreferencePatch) => {
      let payload: PreferencePatch = prefs;
      // First account save after upgrade: keep other device-local UI prefs too.
      if (userId && !wasUiPrefsSeeded(userId)) {
        const localUi = readUiPrefs();
        const localLocale = readStoredLocale();
        payload = {
          hideBalances: localUi.hideBalances,
          reduceMotion: localUi.reduceMotion,
          compactUi: localUi.compactUi,
          locale: localLocale,
          ...prefs,
        };
      }
      const res = await api<PreferenceResponse>("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      applyPreferenceResponse(res);
      if (userId) markUiPrefsSeeded(userId);
      await refreshSpaces();
    },
    [applyPreferenceResponse, refreshSpaces, userId],
  );

  const displayName = personLabel({ name, nameAr }, locale);

  const value = useMemo(
    () => ({
      userId,
      name,
      nameAr,
      displayName,
      house,
      personal,
      active,
      loading,
      personalOnly,
      preferredCurrency,
      theme,
      budgetMonthStartDay,
      showPersonalMonthSpend,
      hideBalances,
      reduceMotion,
      compactUi,
      setKind,
      refreshSpaces,
      setPreferences,
    }),
    [
      userId,
      name,
      nameAr,
      displayName,
      house,
      personal,
      active,
      loading,
      personalOnly,
      preferredCurrency,
      theme,
      budgetMonthStartDay,
      showPersonalMonthSpend,
      hideBalances,
      reduceMotion,
      compactUi,
      setKind,
      refreshSpaces,
      setPreferences,
    ],
  );

  return (
    <BooksContext.Provider value={value}>{children}</BooksContext.Provider>
  );
}

export function useBooks() {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error("BooksProvider missing");
  return ctx;
}
