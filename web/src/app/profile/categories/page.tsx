"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { Hint } from "@/components/Hint";
import { useI18n } from "@/components/I18nProvider";
import { useBooks } from "@/components/BooksProvider";
import { categoryLabel, fill } from "@/lib/i18n";
import { householdPath } from "@/lib/space";
import { HIDDEN_EXPENSE_CATEGORIES, HIDDEN_INCOME_CATEGORIES } from "@/lib/category-visibility";

type ManageCat = {
  id: string;
  name: string;
  nameAr: string;
  color: string;
  kind: "EXPENSE" | "INCOME" | "PEER";
  parentId: string | null;
  sortOrder: number;
  seedKey: string | null;
  isUserManaged: boolean;
  isCustom: boolean;
  protected: boolean;
  canRename: boolean;
  canDelete: boolean;
  childCount: number;
  txCount: number;
};

type KindTab = "EXPENSE" | "INCOME";

type EditorMode =
  | { type: "closed" }
  | { type: "create"; parentId: string | null; kind: KindTab }
  | { type: "edit"; cat: ManageCat };

const ACCENT_COLORS = [
  "#0f766e",
  "#0369a1",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#15803d",
  "#c2410c",
  "#4338ca",
];

function isHidden(cat: ManageCat) {
  if (cat.kind === "INCOME") return HIDDEN_INCOME_CATEGORIES.has(cat.seedKey ?? cat.name);
  if (cat.kind === "EXPENSE") return HIDDEN_EXPENSE_CATEGORIES.has(cat.seedKey ?? cat.name);
  return true;
}

export default function MyCategoriesPage() {
  const { t, locale } = useI18n();
  const { personal, setKind } = useBooks();
  const [cats, setCats] = useState<ManageCat[]>([]);
  const [kind, setKindTab] = useState<KindTab>("EXPENSE");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorMode>({ type: "closed" });
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [color, setColor] = useState(ACCENT_COLORS[0]);
  const [parentId, setParentId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  function load(hid: string) {
    return api<ManageCat[]>(householdPath(hid, "/categories/manage")).then(
      (rows) => {
        setCats(rows);
        return rows;
      },
    );
  }

  useEffect(() => {
    if (!personal) return;
    setKind("PERSONAL");
    load(personal.householdId).catch((e) => setError(e.message));
  }, [personal?.householdId, setKind]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cats.filter((c) => {
      if (c.kind !== kind) return false;
      if (isHidden(c) && !c.isCustom) return false;
      if (!q) return true;
      const label = categoryLabel(c, locale, t).toLowerCase();
      return (
        label.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.nameAr.toLowerCase().includes(q)
      );
    });
  }, [cats, kind, search, locale, t]);

  const parents = useMemo(
    () => visible.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [visible],
  );

  const kidsOf = (id: string) =>
    visible
      .filter((c) => c.parentId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const parentOptions = useMemo(
    () =>
      cats.filter(
        (c) =>
          c.kind === (editor.type === "edit" ? editor.cat.kind : kind) &&
          !c.parentId &&
          (editor.type !== "edit" || c.id !== editor.cat.id),
      ),
    [cats, editor, kind],
  );

  function openCreate(parent: string | null) {
    setError("");
    setFlash("");
    setName("");
    setNameAr("");
    setColor(ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)]);
    setParentId(parent ?? "");
    setEditor({ type: "create", parentId: parent, kind });
  }

  function openEdit(cat: ManageCat) {
    setError("");
    setFlash("");
    setName(cat.name);
    setNameAr(cat.nameAr);
    setColor(cat.color);
    setParentId(cat.parentId ?? "");
    setEditor({ type: "edit", cat });
    if (cat.parentId) {
      setExpanded((prev) => new Set(prev).add(cat.parentId!));
    }
  }

  function closeEditor() {
    setEditor({ type: "closed" });
    setError("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!personal) return;
    setBusy(true);
    setError("");
    try {
      if (editor.type === "create") {
        await api(householdPath(personal.householdId, "/categories/manage"), {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            nameAr: nameAr.trim(),
            color,
            kind: editor.kind,
            parentId: parentId || undefined,
          }),
        });
      } else if (editor.type === "edit") {
        await api(
          householdPath(
            personal.householdId,
            `/categories/manage/${editor.cat.id}`,
          ),
          {
            method: "PATCH",
            body: JSON.stringify({
              name: name.trim(),
              nameAr: nameAr.trim(),
              color,
              parentId: parentId || "",
            }),
          },
        );
      }
      await load(personal.householdId);
      setFlash(t("catsSaved"));
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(cat: ManageCat) {
    if (!personal || !cat.canDelete) return;
    if (!window.confirm(t("catsDeleteConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      await api(
        householdPath(personal.householdId, `/categories/manage/${cat.id}`),
        { method: "DELETE" },
      );
      await load(personal.householdId);
      setFlash(t("catsSaved"));
      if (editor.type === "edit" && editor.cat.id === cat.id) closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!personal) {
    return (
      <PageShell>
        <p className="text-[var(--muted)]">…</p>
        <BottomNav />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)]"
      >
        ← {t("navProfile")}
      </Link>
      <h1 className="page-title mt-2">🏷️ {t("catsManageTitle")}</h1>
      <Hint>{t("catsManageHint")}</Hint>
      {flash ? <p className="flash mt-3">{flash}</p> : null}
      {error && editor.type === "closed" ? (
        <p className="mt-3 text-red-700">{error}</p>
      ) : null}

      <div className="seg mt-5 grid-cols-2">
        {(["EXPENSE", "INCOME"] as KindTab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKindTab(k)}
            className={`rounded-2xl py-2.5 text-base font-bold transition ${
              kind === k
                ? "bg-[var(--surface-bg)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)]"
            }`}
          >
            {k === "EXPENSE" ? t("catsExpense") : t("catsIncome")}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("catsSearch")}
          className="field min-w-0 flex-1 rounded-2xl px-4 py-3"
          dir="auto"
        />
        <button
          type="button"
          onClick={() => openCreate(null)}
          className="shrink-0 rounded-2xl bg-[var(--cta-bg)] px-4 py-3 text-sm font-bold text-[var(--cta-fg)]"
        >
          ＋ {t("catsAddGroup")}
        </button>
      </div>

      {editor.type !== "closed" ? (
        <form
          onSubmit={onSave}
          className="surface mt-4 space-y-3 rounded-[1.75rem] p-4"
        >
          <h2 className="text-lg font-bold">
            {editor.type === "create"
              ? editor.parentId
                ? t("catsAddSub")
                : t("catsAddGroup")
              : t("catsEdit")}
          </h2>
          {editor.type === "edit" && editor.cat.protected ? (
            <p className="rounded-2xl bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--muted)]">
              {t("catsProtectedHint")}
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1 block font-medium">{t("catsName")}</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={editor.type === "edit" && !editor.cat.canRename}
              className="field w-full rounded-2xl px-4 py-3 text-lg disabled:opacity-60"
              dir="auto"
            />
            <Hint>{t("catsNameHint")}</Hint>
          </label>

          <label className="block">
            <span className="mb-1 block font-medium">{t("catsNameAr")}</span>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="field w-full rounded-2xl px-4 py-3 text-lg"
              dir="rtl"
            />
            <Hint>{t("catsNameArHint")}</Hint>
          </label>

          <div>
            <p className="mb-2 font-medium">{t("catsColor")}</p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-10 w-10 rounded-full ring-2 transition ${
                    color === c
                      ? "ring-[var(--foreground)] scale-110"
                      : "ring-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block font-medium">{t("catsParent")}</span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="field w-full rounded-2xl px-4 py-3 text-base"
            >
              <option value="">{t("catsParentNone")}</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {categoryLabel(p, locale, t)}
                </option>
              ))}
            </select>
            <Hint>{t("catsParentHint")}</Hint>
          </label>

          {error ? <p className="text-red-700">{error}</p> : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-2xl bg-[var(--cta-bg)] px-5 py-3 text-base font-bold text-[var(--cta-fg)] disabled:opacity-60"
            >
              {busy ? t("catsSaving") : t("catsSave")}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded-2xl bg-[var(--panel-soft)] px-5 py-3 text-base font-semibold"
            >
              {t("catsCancel")}
            </button>
            {editor.type === "edit" && editor.cat.canDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(editor.cat)}
                className="ms-auto rounded-2xl px-4 py-3 text-base font-semibold text-red-700"
              >
                {t("catsDelete")}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="mt-5 space-y-2">
        {parents.length === 0 ? (
          <p className="surface rounded-3xl px-4 py-6 text-center text-[var(--muted)]">
            {t("catsEmpty")}
          </p>
        ) : (
          parents.map((p) => {
            const kids = kidsOf(p.id);
            const open = expanded.has(p.id) || search.trim().length > 0;
            return (
              <section
                key={p.id}
                className="surface overflow-hidden rounded-[1.5rem]"
              >
                <div className="flex items-stretch gap-1 p-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition hover:bg-[var(--panel-soft)]"
                  >
                    <span
                      className="h-10 w-10 shrink-0 rounded-2xl"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-base font-bold">
                          {categoryLabel(p, locale, t)}
                        </span>
                        {p.isCustom ? (
                          <span className="rounded-full bg-[var(--accent-b-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-b-text)]">
                            {t("catsCustomBadge")}
                          </span>
                        ) : p.isUserManaged ? (
                          <span className="rounded-full bg-[var(--panel-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                            {t("catsEditedBadge")}
                          </span>
                        ) : null}
                      </span>
                      {kids.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {fill(t("catsSubsCount"), { n: String(kids.length) })}
                        </span>
                      ) : null}
                    </span>
                    {kids.length > 0 ? (
                      <span
                        className={`shrink-0 text-[var(--muted)] transition ${
                          open ? "rotate-90" : ""
                        }`}
                        aria-hidden
                      >
                        ›
                      </span>
                    ) : null}
                  </button>
                  <div className="flex shrink-0 flex-col gap-1 py-1 pe-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded-xl bg-[var(--panel-soft)] px-2.5 py-1.5 text-xs font-semibold"
                    >
                      {t("catsEdit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExpanded((prev) => new Set(prev).add(p.id));
                        openCreate(p.id);
                      }}
                      className="rounded-xl bg-[var(--panel-soft)] px-2.5 py-1.5 text-xs font-semibold"
                    >
                      ＋
                    </button>
                  </div>
                </div>

                {open && kids.length > 0 ? (
                  <ul className="space-y-1 border-t border-[var(--surface-border)] px-2 pb-2 pt-1">
                    {kids.map((k) => (
                      <li key={k.id}>
                        <div className="flex items-center gap-2 rounded-2xl px-2 py-2 hover:bg-[var(--panel-soft)]">
                          <span
                            className="ms-4 h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: k.color }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            {categoryLabel(k, locale, t)}
                          </span>
                          {k.isCustom ? (
                            <span className="rounded-full bg-[var(--accent-b-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent-b-text)]">
                              {t("catsCustomBadge")}
                            </span>
                          ) : k.isUserManaged ? (
                            <span className="text-[9px] font-semibold text-[var(--muted)]">
                              {t("catsEditedBadge")}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEdit(k)}
                            className="rounded-lg bg-[var(--panel-soft)] px-2 py-1 text-xs font-semibold"
                          >
                            {t("catsEdit")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      <BottomNav />
    </PageShell>
  );
}
