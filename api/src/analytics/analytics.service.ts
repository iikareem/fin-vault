import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipContext } from '../households/membership-context';
import { actorForSpace, HOUSE_ACTOR } from '../households/house-actor';
import { dateOnlyUtc, isoFromDbDate, isoLocal } from '../common/calendar';
import {
  NON_SPEND_CATEGORY_NAMES,
  nonSpendCategoryFilter,
} from '../categories/non-spend-categories';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private pick(
    rows: { type: string; _sum: { amount: unknown } }[],
    type: string,
  ) {
    return Number(rows.find((r) => r.type === type)?._sum.amount ?? 0);
  }

  /** True spend (excludes wallet transfer + cash withdrawal). */
  private isSpendTx(tx: { type: string; category?: { name: string } | null }) {
    if (
      tx.type !== 'EXPENSE' &&
      tx.type !== 'REIMBURSEMENT' &&
      tx.type !== 'TRACK'
    ) {
      return false;
    }
    const name = tx.category?.name;
    if (name && (NON_SPEND_CATEGORY_NAMES as readonly string[]).includes(name)) {
      return false;
    }
    return true;
  }

  private async walletTotal(householdId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archived: false },
    });
    const sums = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { householdId },
      _sum: { amount: true },
    });
    let totalMoney = 0;
    for (const account of accounts) {
      const amt = (type: string) =>
        Number(
          sums.find((s) => s.accountId === account.id && s.type === type)?._sum
            .amount ?? 0,
        );
      totalMoney +=
        Number(account.openingBalance) +
        amt('INCOME') -
        amt('EXPENSE') -
        amt('REIMBURSEMENT');
    }
    return totalMoney;
  }

  private monthKey(d: Date) {
    return isoFromDbDate(d).slice(0, 7);
  }

  private currentMonthKey() {
    return isoLocal(new Date()).slice(0, 7);
  }

  private nextMonthKey(key: string) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthsThrough(fromKey: string, toKey: string) {
    const keys: string[] = [];
    let cur = fromKey;
    while (cur <= toKey) {
      keys.push(cur);
      cur = this.nextMonthKey(cur);
    }
    return keys;
  }

  async cashSavings(householdId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archived: false, type: 'CASH' },
    });
    const opening = accounts.reduce(
      (sum, account) => sum + Number(account.openingBalance),
      0,
    );
    const ids = accounts.map((a) => a.id);
    const txs = ids.length
      ? await this.prisma.transaction.findMany({
          where: {
            householdId,
            accountId: { in: ids },
            category: { name: { not: 'Wallet transfer' } },
          },
          select: { occurredOn: true, type: true, amount: true },
        })
      : [];

    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const tx of txs) {
      const key = this.monthKey(tx.occurredOn);
      const cur = byMonth.get(key) ?? { income: 0, expense: 0 };
      const amt = Number(tx.amount);
      if (tx.type === 'INCOME') cur.income += amt;
      else if (tx.type === 'EXPENSE' || tx.type === 'REIMBURSEMENT') {
        cur.expense += amt;
      }
      // TRACK is log-only and does not change cash.
      byMonth.set(key, cur);
    }

    const endKey = this.currentMonthKey();
    const activity = [...byMonth.keys()].sort();
    const startKey = activity[0] && activity[0] < endKey ? activity[0] : endKey;
    const months = this.monthsThrough(startKey, endKey).map((month) => {
      const flow = byMonth.get(month) ?? { income: 0, expense: 0 };
      return { month, ...flow };
    });

    let remaining = opening;
    const rows = months.map((m) => {
      const broughtForward = remaining;
      const saved = m.income - m.expense;
      remaining = broughtForward + saved;
      return {
        month: m.month,
        broughtForward,
        income: m.income,
        expense: m.expense,
        saved,
        remaining,
      };
    });

    const current =
      rows.find((r) => r.month === endKey) ?? {
        month: endKey,
        broughtForward: opening,
        income: 0,
        expense: 0,
        saved: 0,
        remaining: opening,
      };

    return { opening, cashNow: remaining, current, months: rows };
  }

  async summary(membership: MembershipContext, userId: string) {
    const householdId = membership.householdId;
    const now = new Date();
    const today = dateOnlyUtc(isoLocal(now));
    const [totalMoney, cash, cashAccounts] = await Promise.all([
      this.walletTotal(householdId),
      this.cashSavings(householdId),
      this.prisma.account.findMany({
        where: { householdId, archived: false, type: 'CASH' },
        select: { id: true },
      }),
    ]);
    const cashIds = cashAccounts.map((a) => a.id);

    const todayAgg = cashIds.length
      ? await this.prisma.transaction.groupBy({
          by: ['type'],
          where: {
            householdId,
            accountId: { in: cashIds },
            occurredOn: today,
            category: nonSpendCategoryFilter,
          },
          _sum: { amount: true },
        })
      : [];

    // TRACK still counts as spending for today/month totals; wallets ignore it.
    // Cash withdrawal is excluded (money left Current, real spend is logged later via TRACK).
    const todayExpense =
      this.pick(todayAgg, 'EXPENSE') + this.pick(todayAgg, 'TRACK');

    let youOwe = 0;
    let youAreOwed = 0;
    let claimsWaiting = 0;
    let claimsPendingTotal = 0;
    let claimsPendingCount = 0;
    let coversWaiting = 0;
    let coversPendingTotal = 0;
    let coversPendingCount = 0;

    if (membership.kind === 'HOUSE') {
      const [loans, myClaims, openClaims, myCovers, openCovers] =
        await Promise.all([
          this.prisma.peerLoan.findMany({
            where: {
              householdId,
              status: 'OPEN',
              OR: [{ fromUserId: userId }, { toUserId: userId }],
            },
            include: { repayments: true },
          }),
          this.prisma.houseClaim.findMany({
            where: {
              householdId,
              memberId: userId,
              status: { not: 'REIMBURSED' },
            },
            include: { reimbursements: true },
          }),
          this.prisma.houseClaim.findMany({
            where: { householdId, status: { not: 'REIMBURSED' } },
            include: { reimbursements: true },
          }),
          this.prisma.houseCover.findMany({
            where: {
              householdId,
              memberId: userId,
              status: { not: 'SETTLED' },
            },
            include: { repayments: true },
          }),
          this.prisma.houseCover.findMany({
            where: { householdId, status: { not: 'SETTLED' } },
            include: { repayments: true },
          }),
        ]);
      for (const loan of loans) {
        const remaining =
          Number(loan.originalAmount) -
          loan.repayments.reduce((s, r) => s + Number(r.amount), 0);
        if (loan.toUserId === userId) youOwe += remaining;
        if (loan.fromUserId === userId) youAreOwed += remaining;
      }
      for (const claim of myClaims) {
        claimsWaiting +=
          Number(claim.amount) -
          claim.reimbursements.reduce((s, r) => s + Number(r.amount), 0);
      }
      for (const claim of openClaims) {
        const remaining =
          Number(claim.amount) -
          claim.reimbursements.reduce((s, r) => s + Number(r.amount), 0);
        if (remaining > 0.001) {
          claimsPendingTotal += remaining;
          claimsPendingCount += 1;
        }
      }
      for (const cover of myCovers) {
        coversWaiting +=
          Number(cover.amount) -
          cover.repayments.reduce((s, r) => s + Number(r.amount), 0);
      }
      for (const cover of openCovers) {
        const remaining =
          Number(cover.amount) -
          cover.repayments.reduce((s, r) => s + Number(r.amount), 0);
        if (remaining > 0.001) {
          coversPendingTotal += remaining;
          coversPendingCount += 1;
        }
      }
    } else {
      // Personal books: still show house debts both ways.
      const houseMembership = await this.prisma.membership.findFirst({
        where: { userId, household: { kind: 'HOUSE' } },
        select: { householdId: true },
      });
      if (houseMembership) {
        const [myClaims, myCovers] = await Promise.all([
          this.prisma.houseClaim.findMany({
            where: {
              householdId: houseMembership.householdId,
              memberId: userId,
              status: { not: 'REIMBURSED' },
            },
            include: { reimbursements: true },
          }),
          this.prisma.houseCover.findMany({
            where: {
              householdId: houseMembership.householdId,
              memberId: userId,
              status: { not: 'SETTLED' },
            },
            include: { repayments: true },
          }),
        ]);
        for (const claim of myClaims) {
          claimsWaiting +=
            Number(claim.amount) -
            claim.reimbursements.reduce((s, r) => s + Number(r.amount), 0);
        }
        for (const cover of myCovers) {
          coversWaiting +=
            Number(cover.amount) -
            cover.repayments.reduce((s, r) => s + Number(r.amount), 0);
        }
      }
    }

    const monthKey = cash.current.month;
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = dateOnlyUtc(`${monthKey}-01`);
    const monthEnd = dateOnlyUtc(
      `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
    );
    // Month "out" = real spend only (EXPENSE + TRACK), not cash withdrawal / transfers.
    const monthSpendAgg = await this.prisma.transaction.aggregate({
      where: {
        householdId,
        type: { in: ['EXPENSE', 'TRACK'] },
        occurredOn: { gte: monthStart, lte: monthEnd },
        category: nonSpendCategoryFilter,
      },
      _sum: { amount: true },
    });
    const monthExpense = Number(monthSpendAgg._sum.amount ?? 0);

    return {
      totalMoney,
      cashNow: cash.cashNow,
      broughtForward: cash.current.broughtForward,
      savedThisMonth: cash.current.saved,
      monthIncome: cash.current.income,
      monthExpense,
      todayIncome: this.pick(todayAgg, 'INCOME'),
      todayExpense,
      youOwe,
      youAreOwed,
      claimsWaiting,
      claimsPendingTotal,
      claimsPendingCount,
      coversWaiting,
      coversPendingTotal,
      coversPendingCount,
    };
  }

  async byDay(membership: MembershipContext, from: string, to: string) {
    const householdId = membership.householdId;
    const rows = await this.prisma.$queryRaw<
      { day: Date; type: string; total: unknown }[]
    >`
      SELECT t."occurredOn" as day, t.type, SUM(t.amount) as total
      FROM "Transaction" t
      INNER JOIN "Category" c ON c.id = t."categoryId"
      WHERE t."householdId" = ${householdId}
        AND t."occurredOn" >= ${dateOnlyUtc(from)}
        AND t."occurredOn" <= ${dateOnlyUtc(to)}
        AND t.type IN ('INCOME', 'EXPENSE', 'TRACK')
        AND c.name NOT IN ('Wallet transfer', 'Cash withdrawal')
      GROUP BY t."occurredOn", t.type
      ORDER BY t."occurredOn" ASC
    `;
    const map = new Map<
      string,
      { day: string; income: number; expense: number }
    >();
    for (const row of rows) {
      const key = isoFromDbDate(row.day);
      const cur = map.get(key) ?? { day: key, income: 0, expense: 0 };
      if (row.type === 'INCOME') cur.income = Number(row.total);
      else cur.expense += Number(row.total); // EXPENSE + TRACK (not cash withdraw)
      map.set(key, cur);
    }
    if (membership.kind === 'HOUSE') {
      const claims = await this.prisma.houseClaim.findMany({
        where: {
          householdId,
          occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        },
      });
      for (const claim of claims) {
        const key = isoFromDbDate(claim.occurredOn);
        const cur = map.get(key) ?? { day: key, income: 0, expense: 0 };
        cur.expense += Number(claim.amount);
        map.set(key, cur);
      }
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  async byCategory(membership: MembershipContext, from: string, to: string) {
    const householdId = membership.householdId;
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId', 'type'],
      where: {
        householdId,
        type: { not: 'REIMBURSEMENT' },
        occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        category: nonSpendCategoryFilter,
      },
      _sum: { amount: true },
    });
    const cats = await this.prisma.category.findMany({
      where: { householdId },
    });
    const totals = new Map<
      string,
      {
        categoryId: string;
        name: string;
        nameAr: string;
        color: string;
        emoji: string;
        type: string;
        total: number;
      }
    >();
    for (const r of rows) {
      const cat = cats.find((c) => c.id === r.categoryId);
      const group = cat?.parentId
        ? cats.find((c) => c.id === cat.parentId)
        : undefined;
      const bucket = group ?? cat;
      const type = r.type === 'TRACK' ? 'EXPENSE' : r.type;
      const key = `${bucket?.id ?? r.categoryId}:${type}`;
      const cur = totals.get(key) ?? {
        categoryId: bucket?.id ?? r.categoryId,
        name: bucket?.name ?? 'Unknown',
        nameAr: bucket?.nameAr ?? '',
        color: bucket?.color ?? '#64748b',
        emoji: bucket?.emoji ?? '',
        type,
        total: 0,
      };
      cur.total += Number(r._sum.amount ?? 0);
      totals.set(key, cur);
    }
    if (membership.kind === 'HOUSE') {
      const claims = await this.prisma.houseClaim.groupBy({
        by: ['categoryId'],
        where: {
          householdId,
          occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        },
        _sum: { amount: true },
      });
      for (const r of claims) {
        const cat = cats.find((c) => c.id === r.categoryId);
        const key = `${r.categoryId}:EXPENSE`;
        const cur = totals.get(key) ?? {
          categoryId: r.categoryId,
          name: cat?.name ?? 'Unknown',
          nameAr: cat?.nameAr ?? '',
          color: cat?.color ?? '#64748b',
          emoji: cat?.emoji ?? '',
          type: 'EXPENSE',
          total: 0,
        };
        cur.total += Number(r._sum.amount ?? 0);
        totals.set(key, cur);
      }
    }
    return [...totals.values()].sort((a, b) => b.total - a.total);
  }

  async byMember(membership: MembershipContext, from: string, to: string) {
    const householdId = membership.householdId;
    const members = await this.prisma.membership.findMany({
      where: { householdId },
      include: { user: { select: { id: true, name: true } } },
    });
    const rows = await this.prisma.transaction.groupBy({
      by: ['userId', 'type'],
      where: {
        householdId,
        type: { not: 'REIMBURSEMENT' },
        occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        category: nonSpendCategoryFilter,
      },
      _sum: { amount: true },
    });
    const out: { userId: string; name: string; type: string; total: number }[] =
      membership.kind === 'HOUSE'
        ? (() => {
            const totals = new Map<string, number>();
            for (const r of rows) {
              totals.set(
                r.type,
                (totals.get(r.type) ?? 0) + Number(r._sum.amount ?? 0),
              );
            }
            return [...totals.entries()].map(([type, total]) => ({
              userId: HOUSE_ACTOR.id,
              name: HOUSE_ACTOR.name,
              type,
              total,
            }));
          })()
        : rows.map((r) => ({
            userId: r.userId,
            name:
              members.find((m) => m.user.id === r.userId)?.user.name ??
              'Unknown',
            type: r.type === 'TRACK' ? 'EXPENSE' : r.type,
            total: Number(r._sum.amount ?? 0),
          }));
    if (membership.kind !== 'HOUSE') return out;
    const claims = await this.prisma.houseClaim.groupBy({
      by: ['memberId'],
      where: {
        householdId,
        occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
      },
      _sum: { amount: true },
    });
    for (const r of claims) {
      out.push({
        userId: r.memberId,
        name:
          members.find((m) => m.user.id === r.memberId)?.user.name ?? 'Unknown',
        type: 'EXPENSE',
        total: Number(r._sum.amount ?? 0),
      });
    }
    return out;
  }

  /**
   * Purchase-by-purchase log for selected category groups over a date range.
   * Expands each selected id to parent + children (matches byCategory rollup).
   */
  async categoryLog(
    membership: MembershipContext,
    from: string,
    to: string,
    categoryIds: string[],
  ) {
    const ids = [...new Set(categoryIds.filter(Boolean))];
    if (ids.length === 0) {
      throw new BadRequestException('Pick at least one category');
    }

    const householdId = membership.householdId;
    const cats = await this.prisma.category.findMany({
      where: { householdId },
    });
    const selected = new Set(ids);
    const expanded = new Set<string>();
    for (const id of ids) expanded.add(id);
    for (const c of cats) {
      if (selected.has(c.id) || (c.parentId && selected.has(c.parentId))) {
        expanded.add(c.id);
      }
    }
    const expandedIds = [...expanded];
    const selectedCats = cats
      .filter((c) => selected.has(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        nameAr: c.nameAr,
        color: c.color,
        emoji: c.emoji,
      }));
    // Preserve request order for any ids still unknown (deleted)
    const categories =
      selectedCats.length > 0
        ? ids
            .map((id) => selectedCats.find((c) => c.id === id))
            .filter((c): c is NonNullable<typeof c> => !!c)
        : selectedCats;

    const ITEM_CAP = 500;
    const txs = await this.prisma.transaction.findMany({
      where: {
        householdId,
        type: { in: ['EXPENSE', 'TRACK'] },
        occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        categoryId: { in: expandedIds },
        category: nonSpendCategoryFilter,
      },
      include: {
        account: { select: { id: true, name: true } },
        category: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            color: true,
            emoji: true,
            kind: true,
            parentId: true,
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: ITEM_CAP,
    });

    const claims =
      membership.kind === 'HOUSE'
        ? await this.prisma.houseClaim.findMany({
            where: {
              householdId,
              occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
              categoryId: { in: expandedIds },
            },
            include: {
              member: { select: { id: true, name: true } },
              category: {
                select: {
                  id: true,
                  name: true,
                  nameAr: true,
                  color: true,
                  emoji: true,
                  parentId: true,
                },
              },
            },
            orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
            take: ITEM_CAP,
          })
        : [];

    type LogItem = {
      id: string;
      kind: 'tx' | 'claim';
      amount: number;
      note: string;
      type?: string;
      occurredOn: string;
      createdAt: number;
      category: {
        id: string;
        name: string;
        nameAr: string;
        color: string;
        emoji?: string;
        parentId?: string | null;
      };
      account?: { id: string; name: string };
      user?: { id: string; name: string };
    };

    const items: LogItem[] = [
      ...txs.map((t) => {
        const withActor = actorForSpace(membership.kind, t);
        return {
          id: t.id,
          kind: 'tx' as const,
          amount: Number(t.amount),
          note: t.note,
          type: t.type,
          occurredOn: isoFromDbDate(t.occurredOn),
          createdAt: t.createdAt.getTime(),
          category: t.category,
          account: t.account,
          user: withActor.user,
        };
      }),
      ...claims.map((c) => ({
        id: c.id,
        kind: 'claim' as const,
        amount: Number(c.amount),
        note: c.note,
        occurredOn: isoFromDbDate(c.occurredOn),
        createdAt: c.createdAt.getTime(),
        category: c.category,
        user: c.member,
      })),
    ];

    items.sort((a, b) => {
      const d = b.occurredOn.localeCompare(a.occurredOn);
      if (d !== 0) return d;
      return b.createdAt - a.createdAt;
    });

    const truncated = items.length >= ITEM_CAP;
    const capped = items.slice(0, ITEM_CAP);

    const dayMap = new Map<
      string,
      { date: string; total: number; items: Omit<LogItem, 'occurredOn' | 'createdAt'>[] }
    >();
    for (const item of capped) {
      const { occurredOn, createdAt: _c, ...rest } = item;
      const cur = dayMap.get(occurredOn) ?? {
        date: occurredOn,
        total: 0,
        items: [],
      };
      cur.total += item.amount;
      cur.items.push(rest);
      dayMap.set(occurredOn, cur);
    }

    const days = [...dayMap.values()].sort((a, b) =>
      b.date.localeCompare(a.date),
    );
    const total = capped.reduce((s, i) => s + i.amount, 0);

    return {
      from,
      to,
      total,
      purchaseCount: capped.length,
      dayCount: days.length,
      truncated,
      categories,
      days,
    };
  }

  async dayLog(membership: MembershipContext, date: string) {
    const householdId = membership.householdId;
    const day = new Date(date);
    const txs = await this.prisma.transaction.findMany({
      where: { householdId, occurredOn: day },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, nameAr: true, color: true, emoji: true, kind: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const claims =
      membership.kind === 'HOUSE'
        ? await this.prisma.houseClaim.findMany({
            where: { householdId, occurredOn: day },
            include: {
              member: { select: { id: true, name: true } },
              category: { select: { id: true, name: true, nameAr: true, color: true, emoji: true } },
              reimbursements: true,
            },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    const gifts =
      membership.kind === 'HOUSE'
        ? await this.prisma.charityGift.findMany({
            where: { householdId, occurredOn: day },
            include: {
              member: { select: { id: true, name: true } },
              type: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'asc' },
          })
        : [];

    const income = txs
      .filter((t) => t.type === 'INCOME')
      .reduce((s, t) => s + Number(t.amount), 0);
    // TRACK counts as spending; cash withdrawal / wallet transfer do not.
    const expense =
      txs
        .filter((t) => this.isSpendTx(t))
        .reduce((s, t) => s + Number(t.amount), 0) +
      claims.reduce((s, c) => s + Number(c.amount), 0) +
      gifts.reduce(
        (s, g) => s + (g.houseTxId ? 0 : Number(g.amount)),
        0,
      );

    return {
      date,
      income,
      expense,
      txs: txs.map((t) => ({
        ...actorForSpace(membership.kind, t),
        amount: Number(t.amount),
      })),
      claims: claims.map((c) => {
        const reimbursed = c.reimbursements.reduce(
          (s, r) => s + Number(r.amount),
          0,
        );
        return {
          id: c.id,
          amount: Number(c.amount),
          remaining: Math.max(0, Number(c.amount) - reimbursed),
          note: c.note,
          status: c.status,
          member: c.member,
          category: c.category,
          categoryId: c.categoryId,
          memberId: c.memberId,
        };
      }),
      gifts: gifts.map((g) => ({
        id: g.id,
        amount: Number(g.amount),
        note: g.note,
        member: g.houseTxId ? { id: 'house', name: 'House' } : g.member,
        memberId: g.houseTxId ? 'house' : g.memberId,
        type: g.type,
      })),
    };
  }
}
