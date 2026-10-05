import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  budgetMonthRange,
  clampBudgetStartDay,
} from '../common/calendar';
import { nonSpendCategoryFilter } from '../categories/non-spend-categories';
import { UpsertMonthSoftLimitDto } from './dto/upsert-month-soft-limit.dto';

export type SoftLimitMode = 'PERSONAL' | 'ALL';

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  amount: number | null;
  mode: SoftLimitMode | null;
  /** Spend counted toward the active mode (or personal when unset). */
  spent: number;
  spentPersonal: number;
  spentAll: number;
  /** spentAll − spentPersonal (paid commitment expenses in the period). */
  commitmentsSpend: number;
  remaining: number | null;
  pct: number | null;
  overLimit: boolean;
};

@Injectable()
export class MonthSoftLimitsService {
  constructor(private prisma: PrismaService) {}

  private async resolveStartDay(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { budgetMonthStartDay: true },
    });
    return clampBudgetStartDay(user?.budgetMonthStartDay ?? 1);
  }

  private resolvePeriod(periodKey: string | undefined, startDay: number) {
    const range = budgetMonthRange(periodKey ?? new Date(), startDay);
    return range;
  }

  private async periodSpend(householdId: string, from: string, to: string) {
    const monthStart = new Date(`${from}T00:00:00.000Z`);
    const monthEnd = new Date(`${to}T00:00:00.000Z`);
    const base = {
      householdId,
      type: { in: ['EXPENSE', 'TRACK'] as ('EXPENSE' | 'TRACK')[] },
      occurredOn: { gte: monthStart, lte: monthEnd },
      category: nonSpendCategoryFilter,
    };

    const [allAgg, personalAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: base,
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { ...base, subscriptionPayment: { is: null } },
        _sum: { amount: true },
      }),
    ]);

    const spentAll = Number(allAgg._sum?.amount ?? 0);
    const spentPersonal = Number(personalAgg._sum?.amount ?? 0);
    return {
      spentAll,
      spentPersonal,
      commitmentsSpend: Math.max(0, spentAll - spentPersonal),
    };
  }

  private shape(
    periodKey: string,
    periodFrom: string,
    periodTo: string,
    amount: number | null,
    mode: SoftLimitMode | null,
    spends: {
      spentAll: number;
      spentPersonal: number;
      commitmentsSpend: number;
    },
  ): MonthSoftLimitStatus {
    const activeMode = mode ?? 'PERSONAL';
    const spent =
      activeMode === 'ALL' ? spends.spentAll : spends.spentPersonal;
    const pct =
      amount != null && amount > 0
        ? Math.round((spent / amount) * 1000) / 10
        : null;
    return {
      periodKey,
      periodFrom,
      periodTo,
      amount,
      mode,
      spent,
      spentPersonal: spends.spentPersonal,
      spentAll: spends.spentAll,
      commitmentsSpend: spends.commitmentsSpend,
      remaining: amount != null ? Math.max(0, amount - spent) : null,
      pct,
      overLimit: amount != null ? spent > amount + 0.001 : false,
    };
  }

  async getStatus(
    householdId: string,
    userId: string,
    periodKey?: string,
  ): Promise<MonthSoftLimitStatus> {
    const startDay = await this.resolveStartDay(userId);
    const range = this.resolvePeriod(periodKey, startDay);
    const [row, spends] = await Promise.all([
      this.prisma.monthSoftLimit.findUnique({
        where: {
          householdId_periodKey: {
            householdId,
            periodKey: range.key,
          },
        },
      }),
      this.periodSpend(householdId, range.from, range.to),
    ]);

    return this.shape(
      range.key,
      range.from,
      range.to,
      row ? Number(row.amount) : null,
      row ? (row.mode as SoftLimitMode) : null,
      spends,
    );
  }

  async upsert(
    householdId: string,
    userId: string,
    dto: UpsertMonthSoftLimitDto,
  ): Promise<MonthSoftLimitStatus> {
    const startDay = await this.resolveStartDay(userId);
    const range = this.resolvePeriod(dto.periodKey, startDay);

    await this.prisma.monthSoftLimit.upsert({
      where: {
        householdId_periodKey: {
          householdId,
          periodKey: range.key,
        },
      },
      create: {
        householdId,
        periodKey: range.key,
        amount: new Prisma.Decimal(dto.amount),
        mode: dto.mode,
      },
      update: {
        amount: new Prisma.Decimal(dto.amount),
        mode: dto.mode,
      },
    });

    return this.getStatus(householdId, userId, range.key);
  }

  async remove(
    householdId: string,
    userId: string,
    periodKey?: string,
  ): Promise<MonthSoftLimitStatus> {
    const startDay = await this.resolveStartDay(userId);
    const range = this.resolvePeriod(periodKey, startDay);

    try {
      await this.prisma.monthSoftLimit.delete({
        where: {
          householdId_periodKey: {
            householdId,
            periodKey: range.key,
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('No soft limit set for this period');
      }
      throw err;
    }

    return this.getStatus(householdId, userId, range.key);
  }
}
