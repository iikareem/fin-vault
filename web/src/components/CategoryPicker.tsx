"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { labelFor } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";

export type CategoryItem = {
  id: string;
  name: string;
  parentId?: string | null;
  color?: string | null;
};

function ColorDot({
  color,
  active = false,
}: {
  color?: string | null;
  active?: boolean;
}) {
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
  const { t } = useI18n();
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

  const filteredParents = useMemo(() => {
    if (!q) return parents;
    return parents.filter((p) => {
      const parentLabel = labelFor(p.name, t).toLowerCase();
      if (parentLabel.includes(q) || p.name.toLowerCase().includes(q)) {
        return true;
      }
      return (childrenByParent.get(p.id) ?? []).some((c) => {
        const childLabel = labelFor(c.name, t).toLowerCase();
        return childLabel.includes(q) || c.name.toLowerCase().includes(q);
      });
    });
  }, [parents, childrenByParent, q, t]);

  /** When searching, flatten matching leaf categories for one-tap pick. */
  const searchHits = useMemo(() => {
    if (!q) return [] as CategoryItem[];
    const hits: CategoryItem[] = [];
    for (const p of parents) {
      const kids = childrenByParent.get(p.id) ?? [];
      if (kids.length === 0) {
        const label = labelFor(p.name, t).toLowerCase();
        if (label.includes(q) || p.name.toLowerCase().includes(q)) {
          hits.push(p);
        }
        continue;
      }
      for (const c of kids) {
        const childLabel = labelFor(c.name, t).toLowerCase();
        const parentLabel = labelFor(p.name, t).toLowerCase();
        if (
          childLabel.includes(q) ||
          c.name.toLowerCase().includes(q) ||
          parentLabel.includes(q)
        ) {
          hits.push(c);
        }
      }
    }
    return hits.slice(0, 12);
  }, [parents, childrenByParent, q, t]);

  const filteredChildren = useMemo(() => {
    if (!q || !hasSubs) return groupChildren;
    const matched = groupChildren.filter((c) => {
      const childLabel = labelFor(c.name, t).toLowerCase();
      return childLabel.includes(q) || c.name.toLowerCase().includes(q);
    });
    return matched.length > 0 ? matched : groupChildren;
  }, [groupChildren, hasSubs, q, t]);

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
              const label = labelFor(k.name, t).toLowerCase();
              return q && (label.includes(q) || k.name.toLowerCase().includes(q));
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
      ? `${labelFor(group?.name ?? "", t)} · ${labelFor(selected.name, t)}`
      : labelFor(selected.name, t)
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
        <ColorDot color={selected?.color || group?.color} />
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
                    ? `${labelFor(parent.name, t)} · ${labelFor(c.name, t)}`
                    : labelFor(c.name, t);
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
                      <ColorDot
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
                          <ColorDot color={p.color} active={active} />
                          <span className="line-clamp-2 text-[0.7rem] font-bold leading-tight">
                            {labelFor(p.name, t)}
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
                        · {labelFor(group.name, t)}
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
                          <ColorDot
                            color={c.color || group?.color}
                            active={active}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {labelFor(c.name, t)}
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
