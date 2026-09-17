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
  const searchRef = useRef<HTMLInputElement | null>(null);

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
      const kids = childrenByParent.get(p.id) ?? [];
      return kids.some((c) => {
        const childLabel = labelFor(c.name, t).toLowerCase();
        return childLabel.includes(q) || c.name.toLowerCase().includes(q);
      });
    });
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
      inline: "center",
      behavior: "smooth",
    });
  }, [groupId, open]);

  useEffect(() => {
    if (open && parents.length > 6) {
      searchRef.current?.focus();
    }
  }, [open, parents.length]);

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

  function pickSub(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  const selectedLabel = selected
    ? hasSubs && selected.parentId
      ? `${labelFor(group?.name ?? "", t)} · ${labelFor(selected.name, t)}`
      : labelFor(selected.name, t)
    : t("catPickGroup");

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
        <div className="space-y-2 rounded-2xl bg-[var(--panel-soft)] p-2.5 ring-1 ring-[var(--input-border)]">
          {parents.length > 6 ? (
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("catSearch")}
              className="field !rounded-xl !py-2 text-sm"
              enterKeyHint="search"
              autoComplete="off"
            />
          ) : null}

          {filteredParents.length === 0 ? (
            <p className="px-2 py-2 text-sm text-[var(--muted)]">
              {t("catNoMatch")}
            </p>
          ) : (
            <div
              className="chip-rail -mx-0.5 px-0.5"
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
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${
                      active
                        ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                        : "bg-[var(--surface-bg)] text-[var(--foreground)] ring-1 ring-[var(--input-border)]"
                    }`}
                  >
                    <ColorDot color={p.color} active={active} />
                    {labelFor(p.name, t)}
                  </button>
                );
              })}
            </div>
          )}

          {hasSubs ? (
            <div
              className="max-h-36 overflow-y-auto overscroll-contain rounded-xl bg-[var(--surface-bg)] p-1.5"
              role="listbox"
              aria-label={t("pickSubCategory")}
            >
              <div className="flex flex-wrap gap-1.5">
                {filteredChildren.map((c) => {
                  const active = selected?.parentId ? value === c.id : false;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pickSub(c.id)}
                      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                        active
                          ? "bg-[var(--cta-bg)] text-[var(--cta-fg)]"
                          : "bg-[var(--panel-soft)] text-[var(--foreground)] ring-1 ring-[var(--input-border)]"
                      }`}
                    >
                      <ColorDot
                        color={c.color || group?.color}
                        active={active}
                      />
                      {labelFor(c.name, t)}
                      {active ? <span aria-hidden>✓</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
