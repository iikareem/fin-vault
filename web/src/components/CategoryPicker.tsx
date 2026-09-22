"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { categoryLabel } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";

export type CategoryItem = {
  id: string;
  name: string;
  nameAr?: string | null;
  parentId?: string | null;
  color?: string | null;
  emoji?: string | null;
};

function CatIcon({
  emoji,
  color,
  active = false,
}: {
  emoji?: string | null;
  color?: string | null;
  active?: boolean;
}) {
  if (emoji) {
    return (
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-sm ${
          active ? "ring-2 ring-white/70" : ""
        }`}
        style={{ backgroundColor: color ? `${color}33` : "transparent" }}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "ring-2 ring-white/70" : ""}`}
      style={{ backgroundColor: color || "var(--muted)" }}
      aria-hidden
    />
  );
}

export function CategoryPicker({
  categories,
  value,
  onChange,
  groupLabel,
}: {
  categories: CategoryItem[];
  value: string;
  onChange: (id: string) => void;
  groupLabel?: string;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const activeGroupRef = useRef<HTMLButtonElement | null>(null);

  const parents = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryItem[]>();
    for (const c of categories) {
      if (!c.parentId) continue;
      const list = map.get(c.parentId) ?? [];
      list.push(c);
      map.set(c.parentId, list);
    }
    return map;
  }, [categories]);

  const selected = categories.find((c) => c.id === value);
  const groupId = selected?.parentId ?? selected?.id ?? "";
  const group = parents.find((p) => p.id === groupId) ?? selected;
  const groupChildren = childrenByParent.get(groupId) ?? [];
  const hasSubs = groupChildren.length > 0;

  const q = query.trim().toLowerCase();
  const catText = (c: CategoryItem) => categoryLabel(c, locale, t);

  const filteredParents = useMemo(() => {
    if (!q) return parents;
    return parents.filter((p) => {
      const parentLabel = catText(p).toLowerCase();
      if (
        parentLabel.includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.nameAr ?? "").toLowerCase().includes(q)
      ) {
        return true;
      }
      return (childrenByParent.get(p.id) ?? []).some((c) => {
        const childLabel = catText(c).toLowerCase();
        return (
          childLabel.includes(q) ||
          c.name.toLowerCase().includes(q) ||
          (c.nameAr ?? "").toLowerCase().includes(q)
        );
      });
    });
  }, [parents, childrenByParent, q, locale, t]);

  /** When searching, flatten matching leaf categories for one-tap pick. */
  const searchHits = useMemo(() => {
    if (!q) return [] as CategoryItem[];
    const hits: CategoryItem[] = [];
    for (const p of parents) {
      const kids = childrenByParent.get(p.id) ?? [];
      if (kids.length === 0) {
        const label = catText(p).toLowerCase();
        if (
          label.includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.nameAr ?? "").toLowerCase().includes(q)
        ) {
          hits.push(p);
        }
        continue;
      }
      for (const c of kids) {
        const childLabel = catText(c).toLowerCase();
        const parentLabel = catText(p).toLowerCase();
        if (
          childLabel.includes(q) ||
          c.name.toLowerCase().includes(q) ||
          (c.nameAr ?? "").toLowerCase().includes(q) ||
          parentLabel.includes(q)
        ) {
          hits.push(c);
        }
      }
    }
    return hits.slice(0, 12);
  }, [parents, childrenByParent, q, locale, t]);

  const filteredChildren = useMemo(() => {
    if (!q || !hasSubs) return groupChildren;
    const matched = groupChildren.filter((c) => {
      const childLabel = catText(c).toLowerCase();
      return (
        childLabel.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.nameAr ?? "").toLowerCase().includes(q)
      );
    });
    return matched.length > 0 ? matched : groupChildren;
  }, [groupChildren, hasSubs, q, locale, t]);

  useEffect(() => {
    if (!open) return;
    activeGroupRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [groupId, open]);

  function pickGroup(id: string) {
    const kids = childrenByParent.get(id);
    if (kids && kids.length > 0) {
      const keep =
        selected?.parentId === id
          ? value
          : kids.find((k) => {
              const label = catText(k).toLowerCase();
              return (
                q &&
                (label.includes(q) ||
                  k.name.toLowerCase().includes(q) ||
                  (k.nameAr ?? "").toLowerCase().includes(q))
              );
            })?.id ?? kids[0].id;
      onChange(keep);
      return;
    }
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  function pickLeaf(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  const selectedLabel = selected
    ? hasSubs && selected.parentId
      ? `${catText(group ?? selected)} · ${catText(selected)}`
      : catText(selected)
    : t("catPickGroup");

  const showSearchHits = q.length >= 1 && searchHits.length > 0;

  return (
    <div className="space-y-2">
      <p className="font-medium">{groupLabel ?? t("forWhat")}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-12 items-center gap-2 rounded-2xl bg-[var(--panel-soft)] px-3 py-2.5 text-start ring-1 ring-[var(--input-border)]"
      >
        <CatIcon
          emoji={selected?.emoji || group?.emoji}
          color={selected?.color || group?.color}
        />
        <span className="min-w-0 flex-1 truncate font-semibold" dir="auto">
          {selectedLabel}
        </span>
        <span className="shrink-0 text-sm font-bold text-[var(--muted)]">
          {open ? t("catDone") : t("catChange")}
        </span>
      </button>

      {open ? (
        <div className="space-y-2.5 rounded-2xl bg-[var(--panel-soft)] p-2.5 ring-1 ring-[var(--input-border)]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("catSearch")}
            className="field !rounded-xl !py-2.5 text-base"
            enterKeyHint="search"
            autoComplete="off"
          />

          {showSearchHits ? (
            <div className="space-y-1.5">
              <p className="px-0.5 text-xs font-semibold text-[var(--muted)]">
                {t("catQuickResults")}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {searchHits.map((c) => {
                  const parent = c.parentId
                    ? parents.find((p) => p.id === c.parentId)
                    : null;
                  const active = value === c.id;
                  const title = parent
                    ? `${catText(parent)} · ${catText(c)}`
                    : catText(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickLeaf(c.id)}
                      className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-start ${
                        active
                          ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                          : "bg-[var(--surface-bg)] text-[var(--foreground)]"
                      }`}
                    >
                      <CatIcon
                        emoji={c.emoji || parent?.emoji}
                        color={c.color || parent?.color}
                        active={active}
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {title}
                      </span>
                      {active ? <span aria-hidden>✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 px-0.5 text-xs font-semibold text-[var(--muted)]">
                  {t("catPickGroup")}
                </p>
                {filteredParents.length === 0 ? (
                  <p className="rounded-xl bg-[var(--surface-bg)] px-3 py-3 text-sm text-[var(--muted)]">
                    {t("catNoMatch")}
                  </p>
                ) : (
                  <div
                    className="grid max-h-48 grid-cols-3 gap-1.5 overflow-y-auto overscroll-contain sm:grid-cols-4"
                    role="listbox"
                    aria-label={groupLabel ?? t("forWhat")}
                  >
                    {filteredParents.map((p) => {
                      const active = groupId === p.id;
                      return (
                        <button
                          key={p.id}
                          ref={active ? activeGroupRef : undefined}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => pickGroup(p.id)}
                          className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center ${
                            active
                              ? "bg-[var(--cta-bg)] text-[var(--cta-fg)] shadow-sm"
                              : "bg-[var(--surface-bg)] text-[var(--foreground)]"
                          }`}
                        >
                          <CatIcon
                            emoji={p.emoji}
                            color={p.color}
                            active={active}
                          />
                          <span className="line-clamp-2 text-[0.7rem] font-bold leading-tight">
                            {catText(p)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {hasSubs ? (
                <div>
                  <p className="mb-1.5 px-0.5 text-xs font-semibold text-[var(--muted)]">
                    {t("pickSubCategory")}
                    {group ? (
                      <span className="font-medium">
                        {" "}
                        · {catText(group)}
                      </span>
                    ) : null}
                  </p>
                  <div
                    className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain"
                    role="listbox"
                    aria-label={t("pickSubCategory")}
                  >
                    {filteredChildren.map((c) => {
                      const active = selected?.parentId
                        ? value === c.id
                        : false;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => pickLeaf(c.id)}
                          className={`flex min-h-11 items-center gap-2 rounded-xl px-2.5 py-2 text-start ${
                            active
                              ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                              : "bg-[var(--surface-bg)] text-[var(--foreground)]"
                          }`}
                        >
                          <CatIcon
                            emoji={c.emoji || group?.emoji}
                            color={c.color || group?.color}
                            active={active}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {catText(c)}
                          </span>
                          {active ? <span aria-hidden>✓</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
