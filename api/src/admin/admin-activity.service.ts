import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isMockUserEmail } from './app-admin';

const MS_HOUR = 1000 * 60 * 60;
const MS_DAY = MS_HOUR * 24;

export type ActivityPeriod = 'day' | 'week' | 'month';
export type ActivityLevel = 'hot' | 'warm' | 'cool' | 'cold' | 'never';
export type ActiveSource = 'seen' | 'login' | 'entry';

function normalizePeriod(raw?: string): ActivityPeriod {
  if (raw === 'day' || raw === 'week' || raw === 'month') return raw;
  return 'week';
}

function periodMs(period: ActivityPeriod): number {
  if (period === 'day') return MS_DAY;
  if (period === 'week') return 7 * MS_DAY;
  return 30 * MS_DAY;
}

function bucketCount(period: ActivityPeriod): number {
  if (period === 'day') return 24;
  if (period === 'week') return 7;
  return 30;
}

function bucketIndex(
  createdAt: Date,
  periodStart: Date,
  period: ActivityPeriod,
): number {
  const offset = createdAt.getTime() - periodStart.getTime();
  if (offset < 0) return -1;
  if (period === 'day') return Math.min(23, Math.floor(offset / MS_HOUR));
  return Math.min(
    bucketCount(period) - 1,
    Math.floor(offset / MS_DAY),
  );
}

function activityLevel(lastActiveAt: Date | null, now: Date): ActivityLevel {
  if (!lastActiveAt) return 'never';
  const ageMs = now.getTime() - lastActiveAt.getTime();
  if (ageMs <= MS_DAY) return 'hot';
  if (ageMs <= 7 * MS_DAY) return 'warm';
  if (ageMs <= 14 * MS_DAY) return 'cool';
  return 'cold';
}

function pickLastActive(
  lastSeenAt: Date | null,
  lastLoginAt: Date | null,
  lastEntryAt: Date | null,
): { at: Date | null; source: ActiveSource | null } {
  const candidates: { at: Date; source: ActiveSource }[] = [];
  if (lastSeenAt) candidates.push({ at: lastSeenAt, source: 'seen' });
  if (lastLoginAt) candidates.push({ at: lastLoginAt, source: 'login' });
  if (lastEntryAt) candidates.push({ at: lastEntryAt, source: 'entry' });
  if (!candidates.length) return { at: null, source: null };
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  return candidates[0];
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AdminActivityService {
  constructor(private prisma: PrismaService) {}

  async listMembers(viewerId: string, periodRaw?: string) {
    const period = normalizePeriod(periodRaw);
    const now = new Date();
    const spanMs = periodMs(period);
    const periodStart = new Date(now.getTime() - spanMs);
    const buckets = bucketCount(period);

    const users = await this.prisma.user.findMany({
      where: { id: { not: viewerId } },
      select: {
        id: true,
        name: true,
        nameAr: true,
        email: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const realUsers = users.filter((u) => !isMockUserEmail(u.email));
    const ids = realUsers.map((u) => u.id);

    const [lastEntryRows, periodTxs] = await Promise.all([
      ids.length
        ? this.prisma.transaction.groupBy({
            by: ['userId'],
            where: { userId: { in: ids } },
            _max: { createdAt: true },
          })
        : Promise.resolve([]),
      ids.length
        ? this.prisma.transaction.findMany({
            where: {
              userId: { in: ids },
              createdAt: { gte: periodStart },
            },
            select: { userId: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const lastEntryByUser = new Map<string, Date>();
    for (const row of lastEntryRows) {
      const at = row._max.createdAt;
      if (at) lastEntryByUser.set(row.userId, at);
    }

    const periodByUser = new Map<
      string,
      { entries: number; days: Set<string>; series: number[] }
    >();

    for (const id of ids) {
      periodByUser.set(id, {
        entries: 0,
        days: new Set(),
        series: Array.from({ length: buckets }, () => 0),
      });
    }

    for (const tx of periodTxs) {
      const row = periodByUser.get(tx.userId);
      if (!row) continue;
      row.entries += 1;
      row.days.add(dayKey(tx.createdAt));
      const idx = bucketIndex(tx.createdAt, periodStart, period);
      if (idx >= 0) row.series[idx] += 1;
    }

    const members = realUsers
      .map((u) => {
        const lastEntryAt = lastEntryByUser.get(u.id) ?? null;
        const picked = pickLastActive(
          u.lastSeenAt,
          u.lastLoginAt,
          lastEntryAt,
        );
        const periodStats = periodByUser.get(u.id) ?? {
          entries: 0,
          days: new Set<string>(),
          series: Array.from({ length: buckets }, () => 0),
        };
        const level = activityLevel(picked.at, now);
        const activeInPeriod = periodStats.entries > 0;

        return {
          id: u.id,
          name: u.name,
          nameAr: u.nameAr,
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          lastEntryAt: lastEntryAt?.toISOString() ?? null,
          lastActiveAt: picked.at?.toISOString() ?? null,
          lastActiveSource: picked.source,
          createdAt: u.createdAt.toISOString(),
          entriesInPeriod: periodStats.entries,
          activeDaysInPeriod: periodStats.days.size,
          series: periodStats.series,
          activeInPeriod,
          level,
        };
      })
      .sort((a, b) => {
        if (a.activeInPeriod !== b.activeInPeriod) {
          return a.activeInPeriod ? -1 : 1;
        }
        if (b.entriesInPeriod !== a.entriesInPeriod) {
          return b.entriesInPeriod - a.entriesInPeriod;
        }
        const aT = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
        const bT = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
        return bT - aT;
      });

    const totalEntries = members.reduce((n, m) => n + m.entriesInPeriod, 0);
    const summary = {
      total: members.length,
      activeInPeriod: members.filter((m) => m.activeInPeriod).length,
      quietInPeriod: members.filter(
        (m) => !m.activeInPeriod && m.lastActiveAt,
      ).length,
      never: members.filter((m) => !m.lastActiveAt).length,
      totalEntries,
    };

    return {
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      summary,
      members,
    };
  }
}
