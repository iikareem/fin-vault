"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "./I18nProvider";
import { useBooks } from "./BooksProvider";
import type { MessageKey } from "@/lib/i18n";

type NavIcon =
  | "home"
  | "charts"
  | "between"
  | "history"
  | "profile"
  | "more"
  | "add";

type SideItem = { href: string; key: MessageKey; icon: NavIcon };

const houseSide: SideItem[] = [
  { href: "/", key: "navHome", icon: "home" },
  { href: "/between", key: "navBetween", icon: "between" },
  { href: "/history", key: "navDays", icon: "history" },
  { href: "/more", key: "navMore", icon: "more" },
];

const mineSide: SideItem[] = [
  { href: "/", key: "navHome", icon: "home" },
  { href: "/analytics", key: "navCharts", icon: "charts" },
  { href: "/history", key: "navDays", icon: "history" },
  { href: "/profile", key: "navProfile", icon: "profile" },
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
  if (href === "/profile") {
    return path === "/profile" || path.startsWith("/profile/");
  }
  return path.startsWith(href);
}

function NavGlyph({
  name,
  className = "",
}: {
  name: NavIcon;
  className?: string;
}) {
  const common = {
    className,
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case "charts":
      return (
        <svg {...common}>
          <path d="M5 19V10.5M12 19V5M19 19v-6.5" />
          <path d="M4 19h16" />
        </svg>
      );
    case "between":
      return (
        <svg {...common}>
          <circle cx="8" cy="9" r="3" />
          <circle cx="16" cy="9" r="3" />
          <path d="M4.5 18c.8-2.4 2.6-3.5 4.5-3.5.8 0 1.5.2 2.2.6M19.5 18c-.8-2.4-2.6-3.5-4.5-3.5-.8 0-1.5.2-2.2.6" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <rect x="4.5" y="5" width="15" height="15" rx="2.5" />
          <path d="M8 3.5v3M16 3.5v3M4.5 10h15" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="3.25" />
          <path d="M6 19.5c1.2-2.8 3.2-4 6-4s4.8 1.2 6 4" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <path d="M5 7.5h14M5 12h14M5 16.5h14" />
        </svg>
      );
    case "add":
      return (
        <svg {...common} width={26} height={26} strokeWidth={2.2}>
          <path d="M12 6.5v11M6.5 12h11" />
        </svg>
      );
  }
}

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { active } = useBooks();
  const personal = active?.kind === "PERSONAL";
  const side = personal ? mineSide : houseSide;
  const left = side.slice(0, 2);
  const right = side.slice(2);
  const addActive = isCurrent(path, "/add");
  const accentText = personal
    ? "text-[var(--accent-b-text)]"
    : "text-[var(--accent-a-text)]";
  const fab = personal
    ? "bg-[var(--accent-b)] text-[var(--accent-b-fg)]"
    : "bg-[var(--accent-a)] text-[var(--accent-a-fg)]";

  function sideLink(item: SideItem) {
    const current = isCurrent(path, item.href);
    const label = t(item.key);
    return (
      <li key={item.href} className="min-w-0">
        <Link
          href={item.href}
          aria-current={current ? "page" : undefined}
          aria-label={label}
          className={`nav-tab flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-colors duration-150 ${
            current ? accentText : "text-[var(--muted)]"
          }`}
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <NavGlyph
              name={item.icon}
              className={current ? "opacity-100" : "opacity-80"}
            />
            <span
              aria-hidden
              className={`absolute -bottom-1 h-1 w-1 rounded-full transition-opacity duration-150 ${
                current
                  ? "bg-current opacity-100"
                  : "opacity-0"
              }`}
            />
          </span>
          <span
            className={`max-w-full truncate text-[0.65rem] leading-none tracking-tight ${
              current ? "font-semibold" : "font-medium opacity-80"
            }`}
          >
            {label}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="pointer-events-auto relative mx-auto max-w-lg">
        <ul className="nav-shell grid grid-cols-5 items-end gap-0.5 rounded-2xl px-1.5 pb-1.5 pt-1.5 backdrop-blur-xl">
          {left.map(sideLink)}
          <li className="relative flex min-h-12 items-end justify-center pb-0.5">
            <Link
              href="/add"
              aria-current={addActive ? "page" : undefined}
              aria-label={t("navAdd")}
              className={`nav-tab -mt-7 mb-0.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-md transition-[box-shadow,opacity] duration-150 ${fab} ${
                addActive
                  ? "opacity-100 shadow-lg"
                  : "opacity-95"
              }`}
            >
              <NavGlyph name="add" />
            </Link>
          </li>
          {right.map(sideLink)}
        </ul>
      </div>
    </nav>
  );
}
