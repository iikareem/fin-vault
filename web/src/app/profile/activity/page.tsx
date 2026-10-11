"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBooks } from "@/components/BooksProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  SettingsCard,
  SettingsPage,
} from "@/components/settings/SettingsChrome";
import { api } from "@/lib/api";
import { fill, personLabel, type MessageKey } from "@/lib/i18n";

type ActivityPeriod = "day" | "week" | "month";
type ActivityLevel = "hot" | "warm" | "cool" | "cold" | "never";
type ActiveSource = "seen" | "login" | "entry";

type MemberActivity = {
  id: string;
  name: string;
  nameAr: string;
  lastSeenAt: string | null;
  lastLoginAt: string | null;
  lastEntryAt: string | null;
  lastActiveAt: string | null;
  lastActiveSource: ActiveSource | null;
  createdAt: string;
  entriesInPeriod: number;
  activeDaysInPeriod: number;
  series: number[];
  activeInPeriod: boolean;
  level: ActivityLevel;
};

type ActivityPayload = {
  period: ActivityPeriod;
  periodStart: string;
  periodEnd: string;
  summary: {
    total: number;
    activeInPeriod: number;
    quietInPeriod: number;
    never: number;
    totalEntries: number;
  };
  members: MemberActivity[];
};

const PERIODS: ActivityPeriod[] = ["day", "week", "month"];

const PERIOD_LABEL: Record<ActivityPeriod, MessageKey> = {
  day: "periodDay",
  week: "periodWeek",
  month: "periodMonth",
};

const LEVEL_LABEL: Record<ActivityLevel, MessageKey> = {
  hot: "activityLevelHot",
  warm: "activityLevelWarm",
  cool: "activityLevelCool",
  cold: "activityLevelCold",
  never: "activityLevelNever",
};

const SOURCE_LABEL: Record<ActiveSource, MessageKey> = {
  seen: "activitySourceSeen",
  login: "activitySourceLogin",
  entry: "activitySourceEntry",
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

function Sparkline({
  series,
  barClass,
  reduceMotion,
}: {
  series: number[];
  barClass: string;
  reduceMotion: boolean;
}) {
  const max = Math.max(1, ...series);
  return (
    <div
      className="flex h-9 items-end gap-px"
      aria-hidden
      title={series.join(", ")}
    >
      {series.map((n, i) => {
        const h = n <= 0 ? 8 : Math.max(18, Math.round((n / max) * 100));
        return (
          <span
            key={i}
            className={`min-w-[3px] flex-1 rounded-sm ${
              n > 0 ? barClass : "bg-[var(--panel-soft)]"
            } ${reduceMotion ? "" : "transition-all duration-300"}`}
            style={{ height: `${h}%`, opacity: n > 0 ? 1 : 0.55 }}
          />
        );
      })}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-[1.15rem] bg-[var(--panel-soft)] px-3 py-3">
      <p className={`text-2xl font-bold tabular-nums tracking-tight ${accent}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[var(--foreground)]">
        {label}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default function ActivitySettingsPage() {
  const { t, locale } = useI18n();
  const { isAppAdmin, loading: booksLoading, reduceMotion } = useBooks();
  const router = useRouter();
  const [period, setPeriod] = useState<ActivityPeriod>("week");
  const [data, setData] = useState<ActivityPayload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(
    async (nextPeriod: ActivityPeriod) => {
      setBusy(true);
      setError("");
      try {
        const res = await api<ActivityPayload>(
          `/admin/activity/members?period=${nextPeriod}`,
        );
        setData(res);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : t("activityLoadFailed");
        setError(msg.includes("Admin") ? t("activityForbidden") : msg);
        setData(null);
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (booksLoading) return;
    if (!isAppAdmin) {
      router.replace("/profile");
      return;
    }
    void load(period);
  }, [booksLoading, isAppAdmin, load, period, router]);

  const members = data?.members ?? [];
  const summary = data?.summary;
  const maxEntries = useMemo(
    () => Math.max(1, ...members.map((m) => m.entriesInPeriod)),
    [members],
  );

  const periodActiveHint = fill(t("activityEntriesInPeriod"), {
    n: String(summary?.totalEntries ?? 0),
  });

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

  return (
    <SettingsPage title={t("activityTitle")} hint={t("activityHint")}>
      {error ? (
        <p className="rounded-2xl bg-[var(--soft-red)] px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <SettingsCard>
        <div
          className="seg grid-cols-3"
          role="tablist"
          aria-label={t("activityPeriodLabel")}
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`seg-item ${period === p ? "seg-active" : ""}`}
            >
              {t(PERIOD_LABEL[p])}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {summary
              ? fill(t("activitySummaryPeople"), { n: String(summary.total) })
              : t("activityLoading")}
          </p>
          <button
            type="button"
            onClick={() => void load(period)}
            disabled={busy}
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--accent-b-text)] transition hover:bg-[var(--accent-b-soft)] active:scale-[0.98] disabled:opacity-50"
          >
            {t("activityRefresh")}
          </button>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryTile
              label={t("activityActiveInPeriod")}
              value={summary.activeInPeriod}
              accent="text-emerald-700 dark:text-emerald-300"
              hint={periodActiveHint}
            />
            <SummaryTile
              label={t("activityQuietInPeriod")}
              value={summary.quietInPeriod}
              accent="text-amber-800 dark:text-amber-200"
            />
            <SummaryTile
              label={t("activityEntriesTotal")}
              value={summary.totalEntries}
              accent="text-[var(--accent-b-text)]"
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
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="surface h-[7.5rem] animate-pulse rounded-[1.35rem] bg-[var(--panel-soft)]"
            />
          ))}
        </div>
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
          const strength = Math.round(
            (member.entriesInPeriod / maxEntries) * 100,
          );
          const sourceKey = member.lastActiveSource
            ? SOURCE_LABEL[member.lastActiveSource]
            : null;

          return (
            <li
              key={member.id}
              className={`surface overflow-hidden rounded-[1.35rem] px-4 py-3.5 ${
                reduceMotion ? "" : "activity-card-in"
              } ${member.activeInPeriod ? "" : "opacity-90"}`}
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
                      member.level === "hot" && !reduceMotion
                        ? "animate-pulse"
                        : ""
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
                        {sourceKey ? (
                          <span className="text-[var(--muted)]">
                            {" · "}
                            {t(sourceKey)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}
                    >
                      {member.activeInPeriod
                        ? t("activityInPeriodBadge")
                        : t(LEVEL_LABEL[member.level])}
                    </span>
                  </div>

                  <div className="mt-3">
                    <Sparkline
                      series={member.series}
                      barClass={tone.bar}
                      reduceMotion={reduceMotion}
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                      <span>
                        {fill(t("activityEntriesCount"), {
                          n: String(member.entriesInPeriod),
                        })}
                      </span>
                      <span>
                        {fill(t("activityActiveDays"), {
                          n: String(member.activeDaysInPeriod),
                        })}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel-soft)]">
                      <div
                        className={`h-full rounded-full ${tone.bar} ${
                          reduceMotion ? "" : "transition-all duration-500"
                        }`}
                        style={{
                          width: `${member.entriesInPeriod ? strength : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  {(member.lastLoginAt || member.lastSeenAt) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
                      {member.lastSeenAt ? (
                        <span>
                          {t("activityLastSeen")}{" "}
                          <span className="font-medium text-[var(--foreground)]">
                            {relativeAgo(member.lastSeenAt, t)}
                          </span>
                        </span>
                      ) : null}
                      {member.lastLoginAt ? (
                        <span>
                          {t("activityLastLogin")}{" "}
                          <span className="font-medium text-[var(--foreground)]">
                            {relativeAgo(member.lastLoginAt, t)}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsPage>
  );
}
