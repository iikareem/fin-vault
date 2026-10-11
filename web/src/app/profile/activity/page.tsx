"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";
import { api } from "@/lib/api";
import { fill, personLabel, type MessageKey } from "@/lib/i18n";

type ActivityLevel = "hot" | "warm" | "cool" | "cold" | "never";

type MemberActivity = {
  id: string;
  name: string;
  nameAr: string;
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  entriesLast7Days: number;
  entriesLast30Days: number;
  level: ActivityLevel;
};

type ActivityPayload = {
  summary: {
    total: number;
    activeToday: number;
    activeThisWeek: number;
    quiet: number;
    never: number;
  };
  members: MemberActivity[];
};

const LEVEL_LABEL: Record<ActivityLevel, MessageKey> = {
  hot: "activityLevelHot",
  warm: "activityLevelWarm",
  cool: "activityLevelCool",
  cold: "activityLevelCold",
  never: "activityLevelNever",
};

function levelTone(level: ActivityLevel) {
  switch (level) {
    case "hot":
      return {
        dot: "bg-emerald-500",
        ring: "ring-emerald-500/35",
        chip: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
        bar: "bg-emerald-500",
      };
    case "warm":
      return {
        dot: "bg-[var(--accent-b)]",
        ring: "ring-[var(--accent-b)]/30",
        chip: "bg-[var(--accent-b-soft)] text-[var(--accent-b-text)]",
        bar: "bg-[var(--accent-b)]",
      };
    case "cool":
      return {
        dot: "bg-amber-500",
        ring: "ring-amber-500/30",
        chip: "bg-amber-500/15 text-amber-900 dark:text-amber-100",
        bar: "bg-amber-500",
      };
    case "cold":
      return {
        dot: "bg-stone-400",
        ring: "ring-stone-400/25",
        chip: "bg-[var(--panel-soft)] text-[var(--muted)]",
        bar: "bg-stone-400",
      };
    default:
      return {
        dot: "bg-stone-300",
        ring: "ring-stone-300/20",
        chip: "bg-[var(--panel-soft)] text-[var(--muted)]",
        bar: "bg-stone-300",
      };
  }
}

function relativeAgo(
  iso: string | null,
  t: (key: MessageKey) => string,
): string {
  if (!iso) return t("activityNeverAgo");
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return t("activityJustNow");
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return t("activityJustNow");
  if (mins < 60) return fill(t("activityMinutesAgo"), { n: String(mins) });
  const hours = Math.floor(mins / 60);
  if (hours < 48) return fill(t("activityHoursAgo"), { n: String(hours) });
  const days = Math.floor(hours / 24);
  return fill(t("activityDaysAgo"), { n: String(days) });
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="min-w-0 rounded-[1.15rem] bg-[var(--panel-soft)] px-3 py-3">
      <p className={`text-2xl font-bold tabular-nums tracking-tight ${accent}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-medium leading-snug text-[var(--muted)]">
        {label}
      </p>
    </div>
  );
}

export default function ActivitySettingsPage() {
  const { t, locale } = useI18n();
  const { isAppAdmin, loading: booksLoading, reduceMotion } = useBooks();
  const router = useRouter();
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api<ActivityPayload>("/admin/activity/members");
      setData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("activityLoadFailed");
      setError(msg.includes("Admin") ? t("activityForbidden") : msg);
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    if (booksLoading) return;
    if (!isAppAdmin) {
      router.replace("/profile");
      return;
    }
    void load();
  }, [booksLoading, isAppAdmin, load, router]);

  if (booksLoading || (!isAppAdmin && busy)) {
    return (
      <SettingsPage title={t("activityTitle")} hint={t("activityHint")}>
        <p className="text-sm text-[var(--muted)]">{t("activityLoading")}</p>
      </SettingsPage>
    );
  }

  if (!isAppAdmin) {
    return (
      <SettingsPage title={t("activityTitle")}>
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {t("activityForbidden")}
        </p>
      </SettingsPage>
    );
  }

  const summary = data?.summary;
  const members = data?.members ?? [];
  const maxEntries = Math.max(
    1,
    ...members.map((m) => m.entriesLast30Days),
  );

  return (
    <SettingsPage title={t("activityTitle")} hint={t("activityHint")}>
      {error ? (
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <SettingsCard>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {summary
                ? fill(t("activitySummaryPeople"), {
                    n: String(summary.total),
                  })
                : t("activityLoading")}
            </p>
            <p className="mt-1 text-sm leading-snug text-[var(--muted)]">
              {t("activitySectionHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold text-[var(--accent-b-text)] transition hover:bg-[var(--accent-b-soft)] active:scale-[0.98] disabled:opacity-50"
          >
            {t("activityRefresh")}
          </button>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile
              label={t("activityActiveToday")}
              value={summary.activeToday}
              accent="text-emerald-700 dark:text-emerald-300"
            />
            <SummaryTile
              label={t("activityActiveWeek")}
              value={summary.activeThisWeek}
              accent="text-[var(--accent-b-text)]"
            />
            <SummaryTile
              label={t("activityQuiet")}
              value={summary.quiet}
              accent="text-amber-800 dark:text-amber-200"
            />
            <SummaryTile
              label={t("activityNever")}
              value={summary.never}
              accent="text-[var(--muted)]"
            />
          </div>
        ) : null}
      </SettingsCard>

      {busy && !data ? (
        <p className="text-sm text-[var(--muted)]">{t("activityLoading")}</p>
      ) : null}

      {!busy && members.length === 0 && !error ? (
        <SettingsCard>
          <p className="text-sm text-[var(--muted)]">{t("activityEmpty")}</p>
        </SettingsCard>
      ) : null}

      <ul className="space-y-2.5">
        {members.map((member, index) => {
          const label = personLabel(member, locale);
          const initial = (label.trim()[0] || "?").toUpperCase();
          const tone = levelTone(member.level);
          const weekPct = Math.round(
            (member.entriesLast30Days / maxEntries) * 100,
          );
          return (
            <li
              key={member.id}
              className={`surface overflow-hidden rounded-[1.35rem] px-4 py-3.5 transition ${
                reduceMotion ? "" : "activity-card-in"
              }`}
              style={
                reduceMotion
                  ? undefined
                  : { animationDelay: `${Math.min(index, 8) * 40}ms` }
              }
            >
              <div className="flex items-start gap-3">
                <span className="relative mt-0.5 shrink-0">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ring-2 ${tone.ring}`}
                    style={{
                      background: "var(--accent-b-soft)",
                      color: "var(--accent-b-text)",
                    }}
                    aria-hidden
                  >
                    {initial}
                  </span>
                  <span
                    className={`absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-[var(--surface-bg)] ${tone.dot} ${
                      member.level === "hot" ? "animate-pulse" : ""
                    }`}
                    aria-hidden
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[var(--foreground)]">
                        {label}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {t("activityLastActive")}{" "}
                        <span className="font-semibold text-[var(--foreground)]">
                          {relativeAgo(member.lastActiveAt, t)}
                        </span>
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}
                    >
                      {t(LEVEL_LABEL[member.level])}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-[var(--muted)]">
                    <p>
                      {t("activityLastSeen")}{" "}
                      <span className="font-medium text-[var(--foreground)]">
                        {relativeAgo(member.lastSeenAt, t)}
                      </span>
                    </p>
                    <p>
                      {t("activityLastLogin")}{" "}
                      <span className="font-medium text-[var(--foreground)]">
                        {relativeAgo(member.lastLoginAt, t)}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                      <span>
                        {fill(t("activityEntriesWeek"), {
                          n: String(member.entriesLast7Days),
                        })}
                      </span>
                      <span>
                        {fill(t("activityEntriesMonth"), {
                          n: String(member.entriesLast30Days),
                        })}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
                        style={{ width: `${weekPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

    </SettingsPage>
  );
}
