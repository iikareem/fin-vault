"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_REQUIRED, api } from "@/lib/api";
import { HOUSE_BOOKS_ENABLED } from "@/lib/features";
import { personLabel } from "@/lib/i18n";
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
import { applyUiPrefs, readUiPrefs } from "@/lib/uiPrefs";
import { useI18n } from "./I18nProvider";

export type ThemeMode = ThemeId;

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
  setKind: (kind: "HOUSE" | "PERSONAL") => void;
  refreshSpaces: () => Promise<void>;
  setPreferences: (prefs: {
    preferredCurrency?: string;
    theme?: ThemeMode;
    budgetMonthStartDay?: number;
  }) => Promise<void>;
};

const BooksContext = createContext<BooksValue | null>(null);

const HOUSE_ONLY = ["/between", "/family", "/charity", "/more", "/with-house"];
const PERSONAL_ONLY = ["/gold", "/outside-loans"];

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

export function BooksProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { locale } = useI18n();
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

  const applyMe = useCallback(
    (me: {
      id: string;
      name: string;
      nameAr?: string;
      preferredCurrency?: string;
      theme?: string;
      budgetMonthStartDay?: number;
      spaces: Space[];
      space: Space | null;
      personalOnly?: boolean;
    }) => {
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
    },
    [],
  );

  const refreshSpaces = useCallback(async () => {
    const me = await loadSpace();
    applyMe(me);
  }, [applyMe]);

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
    setLoading(true);
    loadSpace()
      .then((me) => {
        if (cancelled) return;
        applyMe(me);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Error && err.message === AUTH_REQUIRED) {
          router.replace("/login");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onAuthPage, router, applyMe]);

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
    async (prefs: {
      preferredCurrency?: string;
      theme?: ThemeMode;
      budgetMonthStartDay?: number;
    }) => {
      const res = await api<{
        preferredCurrency: string;
        theme: string;
        budgetMonthStartDay: number;
      }>("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      });
      const nextTheme = normalizeTheme(res.theme);
      setTheme(nextTheme);
      applyTheme(nextTheme);
      setPreferredCurrency(res.preferredCurrency);
      setBudgetMonthStartDay(
        Math.min(28, Math.max(1, res.budgetMonthStartDay ?? 1)),
      );
      await refreshSpaces();
    },
    [refreshSpaces],
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
