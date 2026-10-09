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
  dateOnlyUtc,
} from '../common/calendar';
import { nonSpendCategoryFilter } from '../categories/non-spend-categories';
import { UpsertMonthSoftLimitDto } from './dto/upsert-month-soft-limit.dto';

export type SaveTrack = {
  amount: number;
  saved: number;
  remaining: number;
  pct: number;
  met: boolean;
};

export type SpendAllowanceTrack = {
  /** Income − save target (max outflow to hit save goal). */
  allowance: number;
  /** Cash outflow so far (expense + reimbursement). */
  spent: number;
  remaining: number;
  pct: number;
  overAllowance: boolean;
};

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  saveTargetAmount: number | null;
  /** Cash income in the period. */
  periodIncome: number;
  /** Cash outflow (expense + reimbursement). */
  periodOutflow: number;
  spentAll: number;
  commitmentsSpend: number;
  savedThisMonth: number;
  save: SaveTrack | null;
  spendAllowance: SpendAllowanceTrack | null;
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

  private async cashFlow(householdId: string, from: string, to: string) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archived: false, type: 'CASH' },
      select: { id: true },
    });
    const ids = accounts.map((a) => a.id);
    if (ids.length === 0) {
      return { income: 0, outflow: 0, saved: 0 };
    }

    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        householdId,
        accountId: { in: ids },
        occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        category: { name: { not: 'Wallet transfer' } },
        type: { in: ['INCOME', 'EXPENSE', 'REIMBURSEMENT'] },
      },
      _sum: { amount: true },
    });

    const amt = (type: string) =>
      Number(rows.find((r) => r.type === type)?._sum?.amount ?? 0);
    const income = amt('INCOME');
    const outflow = amt('EXPENSE') + amt('REIMBURSEMENT');
    return { income, outflow, saved: income - outflow };
  }

  private async periodSpend(householdId: string, from: string, to: string) {
    const monthStart = dateOnlyUtc(from);
    const monthEnd = dateOnlyUtc(to);
    const base = {
      householdId,
      type: { in: ['EXPENSE', 'TRACK'] as ('EXPENSE' | 'TRACK')[] },
      occurredOn: { gte: monthStart, lte: monthEnd },
      category: nonSpendCategoryFilter,
      travelId: null,
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
      commitmentsSpend: Math.max(0, spentAll - spentPersonal),
    };
  }

  private saveTrack(amount: number | null, saved: number): SaveTrack | null {
    if (amount == null || amount <= 0) return null;
    const pct = Math.round((Math.max(0, saved) / amount) * 1000) / 10;
    return {
      amount,
      saved,
      remaining: Math.max(0, amount - saved),
      pct,
      met: saved + 0.001 >= amount,
    };
  }

  private allowanceTrack(
    income: number,
    saveTarget: number,
    outflow: number,
  ): SpendAllowanceTrack | null {
    if (saveTarget <= 0) return null;
    const allowance = Math.max(0, income - saveTarget);
    const pct =
      allowance > 0
        ? Math.round((outflow / allowance) * 1000) / 10
        : outflow > 0.001
          ? 100
          : 0;
    return {
      allowance,
      spent: outflow,
      remaining: allowance - outflow,
      pct,
      overAllowance: outflow > allowance + 0.001,
    };
  }

  private shape(
    periodKey: string,
    periodFrom: string,
    periodTo: string,
    saveTargetAmount: number | null,
    flow: { income: number; outflow: number; saved: number },
    spends: { spentAll: number; commitmentsSpend: number },
  ): MonthSoftLimitStatus {
    const save = this.saveTrack(saveTargetAmount, flow.saved);
    const spendAllowance =
      saveTargetAmount != null && saveTargetAmount > 0 && flow.income > 0.001
        ? this.allowanceTrack(flow.income, saveTargetAmount, flow.outflow)
        : saveTargetAmount != null && saveTargetAmount > 0
          ? this.allowanceTrack(0, saveTargetAmount, flow.outflow)
          : null;

    return {
      periodKey,
      periodFrom,
      periodTo,
      saveTargetAmount,
      periodIncome: flow.income,
      periodOutflow: flow.outflow,
      spentAll: spends.spentAll,
      commitmentsSpend: spends.commitmentsSpend,
      savedThisMonth: flow.saved,
      save,
      spendAllowance,
      overLimit: Boolean(spendAllowance?.overAllowance),
    };
  }

  async getStatus(
    householdId: string,
    userId: string,
    periodKey?: string,
  ): Promise<MonthSoftLimitStatus> {
    const startDay = await this.resolveStartDay(userId);
    const range = this.resolvePeriod(periodKey, startDay);
    const [row, flow, spends] = await Promise.all([
      this.prisma.monthSoftLimit.findUnique({
        where: {
          householdId_periodKey: {
            householdId,
            periodKey: range.key,
          },
        },
      }),
      this.cashFlow(householdId, range.from, range.to),
      this.periodSpend(householdId, range.from, range.to),
    ]);

    return this.shape(
      range.key,
      range.from,
      range.to,
      row?.saveTargetAmount != null ? Number(row.saveTargetAmount) : null,
      flow,
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

    if (dto.saveTargetAmount === undefined) {
      throw new BadRequestException('Provide saveTargetAmount');
    }

    const existing = await this.prisma.monthSoftLimit.findUnique({
      where: {
        householdId_periodKey: {
          householdId,
          periodKey: range.key,
        },
      },
    });

    if (dto.saveTargetAmount == null) {
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
        saveTargetAmount: new Prisma.Decimal(dto.saveTargetAmount),
      },
      update: {
        saveTargetAmount: new Prisma.Decimal(dto.saveTargetAmount),
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
        throw new NotFoundException('No month plan set for this period');
      }
      throw err;
    }

    return this.getStatus(householdId, userId, range.key);
  }
}
