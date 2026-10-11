import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isMockUserEmail } from './app-admin';

const MS_DAY = 1000 * 60 * 60 * 24;

export type ActivityLevel = 'hot' | 'warm' | 'cool' | 'cold' | 'never';

function activityLevel(lastActiveAt: Date | null, now: Date): ActivityLevel {
  if (!lastActiveAt) return 'never';
  const ageMs = now.getTime() - lastActiveAt.getTime();
  if (ageMs <= MS_DAY) return 'hot';
  if (ageMs <= 7 * MS_DAY) return 'warm';
  if (ageMs <= 14 * MS_DAY) return 'cool';
  return 'cold';
}

@Injectable()
export class AdminActivityService {
  constructor(private prisma: PrismaService) {}

  async listMembers(viewerId: string) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * MS_DAY);
    const monthAgo = new Date(now.getTime() - 30 * MS_DAY);

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
        txs: {
          where: { createdAt: { gte: monthAgo } },
          select: { createdAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const members = users
      .filter((u) => !isMockUserEmail(u.email))
      .map((u) => {
        const lastTxAt = u.txs.reduce<Date | null>((best, tx) => {
          if (!best || tx.createdAt > best) return tx.createdAt;
          return best;
        }, null);
        const lastActiveAt =
          [u.lastSeenAt, u.lastLoginAt, lastTxAt]
            .filter((d): d is Date => Boolean(d))
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const entriesLast7Days = u.txs.filter(
          (tx) => tx.createdAt >= weekAgo,
        ).length;
        const entriesLast30Days = u.txs.length;
        const level = activityLevel(lastActiveAt, now);

        return {
          id: u.id,
          name: u.name,
          nameAr: u.nameAr,
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          lastActiveAt: lastActiveAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
          entriesLast7Days,
          entriesLast30Days,
          level,
        };
      })
      .sort((a, b) => {
        const aT = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
        const bT = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
        return bT - aT;
      });

    const summary = {
      total: members.length,
      activeToday: members.filter((m) => m.level === 'hot').length,
      activeThisWeek: members.filter(
        (m) => m.level === 'hot' || m.level === 'warm',
      ).length,
      quiet: members.filter(
        (m) => m.level === 'cool' || m.level === 'cold',
      ).length,
      never: members.filter((m) => m.level === 'never').length,
    };

    return { summary, members };
  }
}
