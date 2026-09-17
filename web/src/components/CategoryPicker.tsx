"use client";

import { useMemo } from "react";
import { labelFor } from "@/lib/i18n";
import { useI18n } from "@/components/I18nProvider";
import { Hint } from "@/components/Hint";

export type CategoryItem = {
  id: string;
  name: string;
  parentId?: string | null;
};

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
  const groupChildren = childrenByParent.get(groupId) ?? [];

  function pickGroup(id: string) {
    const kids = childrenByParent.get(id);
    if (kids && kids.length > 0) {
      onChange(kids[0].id);
    } else {
      onChange(id);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 font-medium">{groupLabel ?? t("forWhat")}</p>
        <div className="chip-rail" role="listbox" aria-label={groupLabel ?? t("forWhat")}>
          {parents.map((p) => {
            const active = groupId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => pickGroup(p.id)}
                className={`chip shrink-0 ${active ? "chip-active" : ""}`}
              >
                {labelFor(p.name, t)}
              </button>
            );
          })}
        </div>
      </div>
      {groupChildren.length > 0 ? (
        <div>
          <p className="mb-2 font-medium">{t("pickSubCategory")}</p>
          <div
            className="flex flex-wrap gap-2"
            role="listbox"
            aria-label={t("pickSubCategory")}
          >
            {groupChildren.map((c) => {
              const active = selected?.parentId ? value === c.id : false;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onChange(c.id)}
                  className={`chip ${active ? "chip-active" : ""}`}
                >
                  {labelFor(c.name, t)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <Hint>{t("forWhatHint")}</Hint>
    </div>
  );
}
