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
  size = "md",
}: {
  color?: string | null;
  active?: boolean;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";
  return (
    <span
      className={`${dim} shrink-0 rounded-full ${active ? "ring-2 ring-white/80" : ""}`}
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
    activeGroupRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [groupId]);

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
    } else {
      onChange(id);
    }
  }

  const selectedLabel = selected
    ? hasSubs && selected.parentId
      ? `${labelFor(group?.name ?? "", t)} · ${labelFor(selected.name, t)}`
      : labelFor(selected.name, t)
    : "";

  const showSearch = parents.length > 8;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{groupLabel ?? t("forWhat")}</p>
        {hasSubs ? (
          <span className="text-xs font-semibold text-[var(--muted)]">
            {t("catStepSub")}
          </span>
        ) : (
          <span className="text-xs font-semibold text-[var(--muted)]">
            {t("catStepGroup")}
          </span>
        )}
      </div>

      {selectedLabel ? (
        <div className="soft-card flex items-center gap-2">
          <ColorDot color={selected?.color || group?.color} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[var(--muted)]">
              {t("catSelected")}
            </p>
            <p className="truncate font-semibold" dir="auto">
              {selectedLabel}
            </p>
          </div>
          {hasSubs ? (
            <span className="shrink-0 rounded-full bg-[var(--surface-bg)] px-2 py-1 text-xs font-semibold text-[var(--muted)] ring-1 ring-[var(--input-border)]">
              {groupChildren.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {showSearch ? (
        <label className="block">
          <span className="sr-only">{t("catSearch")}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("catSearch")}
            className="field text-base"
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-[var(--muted)]">
          {t("catPickGroup")}
        </p>
        {filteredParents.length === 0 ? (
          <p className="rounded-2xl bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--muted)]">
            {t("catNoMatch")}
          </p>
        ) : (
          <div
            className="grid grid-cols-2 gap-2"
            role="listbox"
            aria-label={groupLabel ?? t("forWhat")}
          >
            {filteredParents.map((p) => {
              const active = groupId === p.id;
              const kids = childrenByParent.get(p.id) ?? [];
              return (
                <button
                  key={p.id}
                  ref={active ? activeGroupRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pickGroup(p.id)}
                  className={`flex min-h-[3.5rem] flex-col items-stretch justify-center gap-1 rounded-2xl px-3 py-2.5 text-start transition ${
                    active
                      ? "bg-[var(--cta-bg)] text-[var(--cta-fg)] shadow-md"
                      : "bg-[var(--panel-soft)] text-[var(--foreground)] ring-1 ring-[var(--input-border)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ColorDot color={p.color} active={active} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold leading-tight">
                      {labelFor(p.name, t)}
                    </span>
                  </span>
                  {kids.length > 0 ? (
                    <span
                      className={`ps-5 text-[0.7rem] font-medium ${
                        active ? "opacity-80" : "text-[var(--muted)]"
                      }`}
                    >
                      {t("catSubCount", { n: String(kids.length) })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hasSubs ? (
        <div className="rounded-[1.25rem] bg-[var(--panel-soft)] p-3 ring-1 ring-[var(--input-border)]">
          <p className="mb-2 text-sm font-medium">
            {t("pickSubCategory")}
            {group ? (
              <span className="ms-1 text-[var(--muted)]">
                · {labelFor(group.name, t)}
              </span>
            ) : null}
          </p>
          <div
            className="grid grid-cols-1 gap-1.5"
            role="listbox"
            aria-label={t("pickSubCategory")}
          >
            {filteredChildren.map((c) => {
              const active = selected?.parentId ? value === c.id : false;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onChange(c.id)}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-start transition ${
                    active
                      ? "bg-[var(--cta-bg)] text-[var(--cta-fg)] shadow-sm"
                      : "bg-[var(--surface-bg)] text-[var(--foreground)]"
                  }`}
                >
                  <ColorDot color={c.color || group?.color} active={active} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {labelFor(c.name, t)}
                  </span>
                  {active ? (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold"
                      aria-hidden
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="h-6 w-6 shrink-0 rounded-full ring-1 ring-[var(--input-border)]"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
