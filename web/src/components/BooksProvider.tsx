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
import { loadSpace, setActiveSpace, type Space } from "@/lib/space";
import {
  normalizeTheme,
  themeMetaColor,
  type ThemeId,
} from "@/lib/themes";

export type ThemeMode = ThemeId;

type BooksValue = {
  userId: string;
  name: string;
  house: Space | null;
  personal: Space | null;
  active: Space | null;
  loading: boolean;
  preferredCurrency: string;
  theme: ThemeMode;
  setKind: (kind: "HOUSE" | "PERSONAL") => void;
  refreshSpaces: () => Promise<void>;
  setPreferences: (prefs: {
    preferredCurrency?: string;
    theme?: ThemeMode;
  }) => Promise<void>;
};

const BooksContext = createContext<BooksValue | null>(null);

const HOUSE_ONLY = ["/between", "/family", "/charity", "/more", "/with-house"];
const PERSONAL_ONLY = ["/gold", "/outside-loans"];

const THEME_KEY = "fb_theme";

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  const color = themeMetaColor(theme);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

export function BooksProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const onLogin = path === "/login";
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [house, setHouse] = useState<Space | null>(null);
  const [personal, setPersonal] = useState<Space | null>(null);
  const [active, setActive] = useState<Space | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferredCurrency, setPreferredCurrency] = useState("EGP");
  const [theme, setTheme] = useState<ThemeMode>("light");

  const applyMe = useCallback(
    (me: {
      id: string;
      name: string;
      preferredCurrency?: string;
      theme?: string;
      spaces: Space[];
      space: Space | null;
    }) => {
      setUserId(me.id);
      setName(me.name);
      const h = me.spaces.find((s) => s.kind === "HOUSE") ?? null;
      const p = me.spaces.find((s) => s.kind === "PERSONAL") ?? null;
      setHouse(h);
      setPersonal(p);
      setActive(me.space ?? h ?? p);
      const nextTheme = normalizeTheme(me.theme);
      setTheme(nextTheme);
      applyTheme(nextTheme);
      setPreferredCurrency(me.preferredCurrency ?? p?.currency ?? "EGP");
    },
    [],
  );

  const refreshSpaces = useCallback(async () => {
    const me = await loadSpace();
    applyMe(me);
  }, [applyMe]);

  useEffect(() => {
    if (onLogin) {
      setLoading(false);
      applyTheme("light");
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
  }, [onLogin, router, applyMe]);

  const setKind = useCallback(
    (kind: "HOUSE" | "PERSONAL") => {
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
    [house, personal, path, router],
  );

  const setPreferences = useCallback(
    async (prefs: { preferredCurrency?: string; theme?: ThemeMode }) => {
      const res = await api<{ preferredCurrency: string; theme: string }>(
        "/auth/preferences",
        {
          method: "PATCH",
          body: JSON.stringify(prefs),
        },
      );
      const nextTheme = normalizeTheme(res.theme);
      setTheme(nextTheme);
      applyTheme(nextTheme);
      setPreferredCurrency(res.preferredCurrency);
      await refreshSpaces();
    },
    [refreshSpaces],
  );

  const value = useMemo(
    () => ({
      userId,
      name,
      house,
      personal,
      active,
      loading,
      preferredCurrency,
      theme,
      setKind,
      refreshSpaces,
      setPreferences,
    }),
    [
      userId,
      name,
      house,
      personal,
      active,
      loading,
      preferredCurrency,
      theme,
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
