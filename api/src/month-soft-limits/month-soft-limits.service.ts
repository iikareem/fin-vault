import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  budgetMonthRange,
  clampBudgetStartDay,
} from '../common/calendar';
import { nonSpendCategoryFilter } from '../categories/non-spend-categories';
import { UpsertMonthSoftLimitDto } from './dto/upsert-month-soft-limit.dto';

export type CeilingTrack = {
  amount: number;
  spent: number;
  remaining: number;
  pct: number;
  overLimit: boolean;
};

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  personalAmount: number | null;
  totalAmount: number | null;
  spentPersonal: number;
  spentAll: number;
  /** spentAll − spentPersonal (paid commitment expenses in the period). */
  commitmentsSpend: number;
  personal: CeilingTrack | null;
  total: CeilingTrack | null;
  /** True when any set ceiling is exceeded. */
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
    return budgetMonthRange(periodKey ?? new Date(), startDay);
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

  private track(amount: number | null, spent: number): CeilingTrack | null {
    if (amount == null || amount <= 0) return null;
    const pct = Math.round((spent / amount) * 1000) / 10;
    return {
      amount,
      spent,
      remaining: Math.max(0, amount - spent),
      pct,
      overLimit: spent > amount + 0.001,
    };
  }

  private shape(
    periodKey: string,
    periodFrom: string,
    periodTo: string,
    personalAmount: number | null,
    totalAmount: number | null,
    spends: {
      spentAll: number;
      spentPersonal: number;
      commitmentsSpend: number;
    },
  ): MonthSoftLimitStatus {
    const personal = this.track(personalAmount, spends.spentPersonal);
    const total = this.track(totalAmount, spends.spentAll);
    return {
      periodKey,
      periodFrom,
      periodTo,
      personalAmount,
      totalAmount,
      spentPersonal: spends.spentPersonal,
      spentAll: spends.spentAll,
      commitmentsSpend: spends.commitmentsSpend,
      personal,
      total,
      overLimit: Boolean(personal?.overLimit || total?.overLimit),
    };
  }

  private decOrNull(v: number | null | undefined): Prisma.Decimal | null {
    if (v == null) return null;
    return new Prisma.Decimal(v);
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
      row?.personalAmount != null ? Number(row.personalAmount) : null,
      row?.totalAmount != null ? Number(row.totalAmount) : null,
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

    const personalAmount =
      dto.personalAmount === undefined ? undefined : dto.personalAmount;
    const totalAmount =
      dto.totalAmount === undefined ? undefined : dto.totalAmount;

    if (personalAmount === undefined && totalAmount === undefined) {
      throw new BadRequestException(
        'Provide personalAmount and/or totalAmount',
      );
    }

    const existing = await this.prisma.monthSoftLimit.findUnique({
      where: {
        householdId_periodKey: {
          householdId,
          periodKey: range.key,
        },
      },
    });

    const nextPersonal =
      personalAmount !== undefined
        ? personalAmount
        : existing?.personalAmount != null
          ? Number(existing.personalAmount)
          : null;
    const nextTotal =
      totalAmount !== undefined
        ? totalAmount
        : existing?.totalAmount != null
          ? Number(existing.totalAmount)
          : null;

    if (
      nextPersonal != null &&
      nextTotal != null &&
      nextTotal + 0.001 < nextPersonal
    ) {
      throw new BadRequestException(
        'Total ceiling should be at least the personal ceiling',
      );
    }

    if (nextPersonal == null && nextTotal == null) {
      if (existing) {
        await this.prisma.monthSoftLimit.delete({ where: { id: existing.id } });
      }
      return this.getStatus(householdId, userId, range.key);
    }

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
        personalAmount: this.decOrNull(nextPersonal),
        totalAmount: this.decOrNull(nextTotal),
      },
      update: {
        personalAmount: this.decOrNull(nextPersonal),
        totalAmount: this.decOrNull(nextTotal),
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
        throw new NotFoundException('No ceiling set for this period');
      }
      throw err;
    }

    return this.getStatus(householdId, userId, range.key);
  }
}
