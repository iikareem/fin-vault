import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipContext } from '../households/membership-context';
import { actorForSpace, HOUSE_ACTOR } from '../households/house-actor';
import { dateOnlyUtc, isoFromDbDate, isoLocal } from '../common/calendar';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private pick(
    rows: { type: string; _sum: { amount: unknown } }[],
    type: string,
  ) {
    return Number(rows.find((r) => r.type === type)?._sum.amount ?? 0);
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
          where: { householdId, accountId: { in: ids } },
          select: { occurredOn: true, type: true, amount: true },
        })
      : [];

    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const tx of txs) {
      const key = this.monthKey(tx.occurredOn);
      const cur = byMonth.get(key) ?? { income: 0, expense: 0 };
      const amt = Number(tx.amount);
      if (tx.type === 'INCOME') cur.income += amt;
      else cur.expense += amt;
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
          },
          _sum: { amount: true },
        })
      : [];

    const todayExpense = this.pick(todayAgg, 'EXPENSE');

    let youOwe = 0;
    let youAreOwed = 0;
    let claimsWaiting = 0;

    if (membership.kind === 'HOUSE') {
      const [loans, myClaims] = await Promise.all([
        this.prisma.peerLoan.findMany({
          where: {
            householdId,
            status: 'OPEN',
            OR: [{ fromUserId: userId }, { toUserId: userId }],
          },
          include: { repayments: true },
        }),
        this.prisma.houseClaim.findMany({
          where: { householdId, memberId: userId, status: { not: 'REIMBURSED' } },
          include: { reimbursements: true },
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
    }

    return {
      totalMoney,
      cashNow: cash.cashNow,
      broughtForward: cash.current.broughtForward,
      savedThisMonth: cash.current.saved,
      monthIncome: cash.current.income,
      monthExpense: cash.current.expense,
      todayIncome: this.pick(todayAgg, 'INCOME'),
      todayExpense,
      youOwe,
      youAreOwed,
      claimsWaiting,
    };
  }

  async byDay(membership: MembershipContext, from: string, to: string) {
    const householdId = membership.householdId;
    const rows = await this.prisma.$queryRaw<
      { day: Date; type: string; total: unknown }[]
    >`
      SELECT "occurredOn" as day, type, SUM(amount) as total
      FROM "Transaction"
      WHERE "householdId" = ${householdId}
        AND "occurredOn" >= ${dateOnlyUtc(from)}
        AND "occurredOn" <= ${dateOnlyUtc(to)}
        AND type <> 'REIMBURSEMENT'
      GROUP BY "occurredOn", type
      ORDER BY "occurredOn" ASC
    `;
    const map = new Map<
      string,
      { day: string; income: number; expense: number }
    >();
    for (const row of rows) {
      const key = isoFromDbDate(row.day);
      const cur = map.get(key) ?? { day: key, income: 0, expense: 0 };
      if (row.type === 'INCOME') cur.income = Number(row.total);
      else cur.expense = Number(row.total);
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
      },
      _sum: { amount: true },
    });
    const cats = await this.prisma.category.findMany({
      where: { householdId },
    });
    const totals = new Map<
      string,
      { categoryId: string; name: string; color: string; type: string; total: number }
    >();
    for (const r of rows) {
      const cat = cats.find((c) => c.id === r.categoryId);
      const key = `${r.categoryId}:${r.type}`;
      totals.set(key, {
        categoryId: r.categoryId,
        name: cat?.name ?? 'Unknown',
        color: cat?.color ?? '#64748b',
        type: r.type,
        total: Number(r._sum.amount ?? 0),
      });
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
          color: cat?.color ?? '#64748b',
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
            type: r.type,
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

  async dayLog(membership: MembershipContext, date: string) {
    const householdId = membership.householdId;
    const day = new Date(date);
    const txs = await this.prisma.transaction.findMany({
      where: { householdId, occurredOn: day },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true, kind: true } },
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
              category: { select: { id: true, name: true, color: true } },
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
    const expense =
      txs
        .filter((t) => t.type !== 'INCOME')
        .reduce((s, t) => s + Number(t.amount), 0) +
      claims.reduce((s, c) => s + Number(c.amount), 0) +
      gifts.reduce((s, g) => s + Number(g.amount), 0);

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
        member: g.member,
        memberId: g.memberId,
        type: g.type,
      })),
    };
  }
}
