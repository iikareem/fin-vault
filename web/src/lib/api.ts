import { isoLocal } from "./calendar";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    goLogin();
    throw new Error("Please log in");
  }
  if (res.status === 401 || res.status === 502 || res.status === 503) {
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
