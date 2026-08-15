import { isoLocal } from "./calendar";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const TIMEOUT_MS = 20000;

function goLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const timed = new AbortController();
  const timer = setTimeout(() => timed.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers,
      signal: timed.signal,
    });
  } catch (e) {
    const onLogin =
      typeof window !== "undefined" && window.location.pathname === "/login";
    const timedOut =
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError");
    if (onLogin) {
      throw new Error(timedOut ? "LOGIN_TIMEOUT" : "LOGIN_NETWORK");
    }
    goLogin();
    throw new Error("Please log in");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) {
    goLogin();
    throw new Error("Please log in");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "Request failed" }));
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message || "Request failed";
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function money(amount: number, currency = "EGP", locale: "ar" | "en" = "ar") {
  return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function todayISO() {
  return isoLocal(new Date());
}
