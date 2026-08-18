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
      <label className="block">
        <span className="mb-1 block font-medium">
          {groupLabel ?? t("forWhat")}
        </span>
        <select
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
          value={groupId}
          onChange={(e) => pickGroup(e.target.value)}
        >
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {labelFor(p.name, t)}
            </option>
          ))}
        </select>
      </label>
      {groupChildren.length > 0 ? (
        <label className="block">
          <span className="mb-1 block font-medium">
            {t("pickSubCategory")}
          </span>
          <select
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-lg"
            value={selected?.parentId ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          >
            {groupChildren.map((c) => (
              <option key={c.id} value={c.id}>
                {labelFor(c.name, t)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Hint>{t("forWhatHint")}</Hint>
    </div>
  );
}
