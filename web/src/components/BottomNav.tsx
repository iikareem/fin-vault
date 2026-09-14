"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { useBooks } from "./BooksProvider";
import type { MessageKey } from "@/lib/i18n";

const houseItems: { href: string; key: MessageKey; emoji: string }[] = [
  { href: "/", key: "navHome", emoji: "🏠" },
  { href: "/add", key: "navAdd", emoji: "➕" },
  { href: "/between", key: "navBetween", emoji: "🤝" },
  { href: "/history", key: "navDays", emoji: "📅" },
  { href: "/more", key: "navMore", emoji: "☰" },
  { href: "/profile", key: "navProfile", emoji: "👤" },
];

const mineItems: { href: string; key: MessageKey; emoji: string }[] = [
  { href: "/", key: "navHome", emoji: "👛" },
  { href: "/add", key: "navAdd", emoji: "➕" },
  { href: "/gold", key: "navGold", emoji: "🥇" },
  { href: "/history", key: "navDays", emoji: "📅" },
  { href: "/analytics", key: "navCharts", emoji: "📊" },
  { href: "/profile", key: "navProfile", emoji: "👤" },
];

function isCurrent(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/more") {
    return (
      path.startsWith("/more") ||
      ["/charity", "/family", "/analytics", "/with-house"].some((p) =>
        path.startsWith(p),
      )
    );
  }
  return path.startsWith(href);
}

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { active } = useBooks();
  const personal = active?.kind === "PERSONAL";
  const items = personal ? mineItems : houseItems;
  const accent = personal
    ? {
        text: "text-sky-900",
        soft: "bg-sky-50",
        add: "bg-sky-800 text-white shadow-sm",
      }
    : {
        text: "text-emerald-900",
        soft: "bg-emerald-50",
        add: "bg-emerald-800 text-white shadow-sm",
      };

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4"
    >
      <ul
        className="pointer-events-auto mx-auto grid max-w-lg grid-cols-6 gap-0.5 rounded-2xl border border-white/70 bg-white/80 px-1.5 py-1.5 shadow-[0_8px_24px_rgb(15_59_42/0.06)] backdrop-blur-xl"
      >
        {items.map((item) => {
          const current = isCurrent(path, item.href);
          const isAdd = item.href === "/add";
          const label = t(item.key);

          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                aria-label={label}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-center transition-colors ${
                  isAdd
                    ? current
                      ? accent.add
                      : "bg-stone-100 text-stone-700"
                    : current
                      ? `${accent.soft} ${accent.text}`
                      : "text-stone-400 hover:text-stone-600"
                }`}
              >
                <span
                  className={`leading-none ${isAdd ? "text-lg" : "text-base"}`}
                  aria-hidden
                >
                  {item.emoji}
                </span>
                {current && !isAdd ? (
                  <span className="max-w-full truncate text-[0.65rem] font-semibold leading-none tracking-tight">
                    {label}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
