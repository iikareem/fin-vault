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
      method: init?.method ?? "GET",
      cache: "no-store",
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

function digits(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(amount) || 0));
}

function currencyLabel(currency: string, locale: "ar" | "en") {
  if (locale === "ar" && currency === "EGP") return "ج.م.";
  return currency;
}

export type MoneySign = "+" | "−" | "-";

export function moneyParts(
  amount: number,
  currency = "EGP",
  locale: "ar" | "en" = "ar",
  extraSign?: MoneySign,
) {
  const value = Number(amount) || 0;
  const n = digits(value);
  const sign =
    extraSign === "+"
      ? "+"
      : extraSign === "−" || extraSign === "-" || value < 0
        ? "-"
        : "";
  return { n, sign, symbol: currencyLabel(currency, locale), locale };
}

/** String form for sentences. Prefer <Money /> in the UI. */
export function money(
  amount: number,
  currency = "EGP",
  locale: "ar" | "en" = "ar",
  extraSign?: MoneySign,
) {
  const { n, sign, symbol } = moneyParts(amount, currency, locale, extraSign);
  const LRI = "\u2066";
  const PDI = "\u2069";
  if (locale === "ar") {
    return `${LRI}${n}${sign}${PDI}\u00A0${symbol}`;
  }
  return `${LRI}${sign}${n} ${symbol}${PDI}`;
}

export function parseAmount(raw: string) {
  const normalized = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/,/g, "")
    .replace(/[−–—]/g, "-")
    .trim();
  return Number(normalized);
}

export function todayISO() {
  return isoLocal(new Date());
}
