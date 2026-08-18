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
  { href: "/history", key: "navDays", emoji: "📅" },
  { href: "/analytics", key: "navCharts", emoji: "📊" },
  { href: "/profile", key: "navProfile", emoji: "👤" },
];

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { active } = useBooks();
  const personal = active?.kind === "PERSONAL";
  const items = personal ? mineItems : houseItems;
  const cols =
    items.length === 6
      ? "grid-cols-6"
      : items.length === 5
        ? "grid-cols-5"
        : "grid-cols-4";
  const activeChip = personal ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900";

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:px-4">
      <ul
        className={`surface pointer-events-auto mx-auto grid max-w-lg ${cols} rounded-[1.5rem] p-1`}
      >
        {items.map((item) => {
          const current =
            item.href === "/"
              ? path === "/"
              : path.startsWith(item.href) ||
                (item.href === "/more" &&
                  ["/charity", "/family", "/analytics", "/with-house"].some((p) =>
                    path.startsWith(p),
                  ));
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[1.15rem] px-0.5 text-center sm:min-h-[3.6rem] ${
                  current ? activeChip : "text-stone-500"
                }`}
              >
                <span className="text-lg leading-none sm:text-xl" aria-hidden>
                  {item.emoji}
                </span>
                <span className="w-full truncate text-[0.7rem] font-bold leading-tight sm:text-sm">
                  {t(item.key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
