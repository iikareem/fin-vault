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
];

const mineItems: { href: string; key: MessageKey; emoji: string }[] = [
  { href: "/", key: "navHome", emoji: "👛" },
  { href: "/add", key: "navAdd", emoji: "➕" },
  { href: "/history", key: "navDays", emoji: "📅" },
  { href: "/analytics", key: "navCharts", emoji: "📊" },
];

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { active } = useBooks();
  const personal = active?.kind === "PERSONAL";
  const items = personal ? mineItems : houseItems;
  const cols = items.length === 5 ? "grid-cols-5" : "grid-cols-4";
  const activeChip = personal ? "bg-sky-100 text-sky-900" : "bg-emerald-100 text-emerald-900";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
      <ul
        className={`surface mx-auto grid max-w-lg ${cols} rounded-[1.75rem] p-1.5`}
      >
        {items.map((item) => {
          const current =
            item.href === "/"
              ? path === "/"
              : path.startsWith(item.href) ||
                (item.href === "/more" &&
                  ["/charity", "/family", "/analytics"].some((p) =>
                    path.startsWith(p),
                  ));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-[4.1rem] flex-col items-center justify-center gap-0.5 rounded-[1.35rem] px-0.5 text-center ${
                  current ? activeChip : "text-stone-500"
                }`}
              >
                <span className="text-xl leading-none" aria-hidden>
                  {item.emoji}
                </span>
                <span className="text-sm font-bold leading-tight">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
