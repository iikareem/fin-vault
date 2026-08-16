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
import { AUTH_REQUIRED } from "@/lib/api";
import { loadSpace, setActiveSpace, type Space } from "@/lib/space";

type BooksValue = {
  userId: string;
  name: string;
  house: Space | null;
  personal: Space | null;
  active: Space | null;
  loading: boolean;
  setKind: (kind: "HOUSE" | "PERSONAL") => void;
};

const BooksContext = createContext<BooksValue | null>(null);

const HOUSE_ONLY = ["/between", "/family", "/charity", "/more", "/with-house"];

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

  useEffect(() => {
    if (onLogin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadSpace()
      .then(({ id, name: n, spaces, space }) => {
        if (cancelled) return;
        setUserId(id);
        setName(n);
        const h = spaces.find((s) => s.kind === "HOUSE") ?? null;
        const p = spaces.find((s) => s.kind === "PERSONAL") ?? null;
        setHouse(h);
        setPersonal(p);
        setActive(space ?? h ?? p);
      })
      .catch((err) => {
        if (cancelled) return;
        // Only leave the app when the session is actually gone.
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
  }, [onLogin, router]);

  const setKind = useCallback(
    (kind: "HOUSE" | "PERSONAL") => {
      const next = kind === "HOUSE" ? house : personal;
      if (!next) return;
      setActiveSpace(next.householdId);
      setActive(next);
      if (kind === "PERSONAL" && HOUSE_ONLY.some((p) => path.startsWith(p))) {
        router.push("/");
      }
    },
    [house, personal, path, router],
  );

  const value = useMemo(
    () => ({ userId, name, house, personal, active, loading, setKind }),
    [userId, name, house, personal, active, loading, setKind],
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
