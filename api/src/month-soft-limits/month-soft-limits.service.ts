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

export type CeilingTrack = {
  amount: number;
  spent: number;
  remaining: number;
  pct: number;
  overLimit: boolean;
};

export type SaveTrack = {
  amount: number;
  saved: number;
  remaining: number;
  pct: number;
  met: boolean;
};

export type MonthSoftLimitStatus = {
  periodKey: string;
  periodFrom: string;
  periodTo: string;
  personalAmount: number | null;
  saveTargetAmount: number | null;
  spentPersonal: number;
  spentAll: number;
  /** spentAll − spentPersonal (paid commitment expenses in the period). */
  commitmentsSpend: number;
  /** Net cash saved this period (same idea as home savedThisMonth). */
  savedThisMonth: number;
  personal: CeilingTrack | null;
  save: SaveTrack | null;
  /** True when the personal spend ceiling is exceeded. */
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
    const monthStart = dateOnlyUtc(from);
    const monthEnd = dateOnlyUtc(to);
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

  /**
   * Match home `savedThisMonth`: cash wallets only, income − (expense + reimbursement),
   * excluding wallet transfers.
   */
  private async periodSaved(householdId: string, from: string, to: string) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archived: false, type: 'CASH' },
      select: { id: true },
    });
    const ids = accounts.map((a) => a.id);
    if (ids.length === 0) return 0;

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
    return amt('INCOME') - amt('EXPENSE') - amt('REIMBURSEMENT');
  }

  private spendTrack(
    amount: number | null,
    spent: number,
  ): CeilingTrack | null {
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

  private saveTrack(amount: number | null, saved: number): SaveTrack | null {
    if (amount == null || amount <= 0) return null;
    const progress = Math.max(0, saved);
    const pct = Math.round((progress / amount) * 1000) / 10;
    return {
      amount,
      saved,
      remaining: Math.max(0, amount - saved),
      pct,
      met: saved + 0.001 >= amount,
    };
  }

  private shape(
    periodKey: string,
    periodFrom: string,
    periodTo: string,
    personalAmount: number | null,
    saveTargetAmount: number | null,
    spends: {
      spentAll: number;
      spentPersonal: number;
      commitmentsSpend: number;
    },
    savedThisMonth: number,
  ): MonthSoftLimitStatus {
    const personal = this.spendTrack(personalAmount, spends.spentPersonal);
    const save = this.saveTrack(saveTargetAmount, savedThisMonth);
    return {
      periodKey,
      periodFrom,
      periodTo,
      personalAmount,
      saveTargetAmount,
      spentPersonal: spends.spentPersonal,
      spentAll: spends.spentAll,
      commitmentsSpend: spends.commitmentsSpend,
      savedThisMonth,
      personal,
      save,
      overLimit: Boolean(personal?.overLimit),
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
    const [row, spends, savedThisMonth] = await Promise.all([
      this.prisma.monthSoftLimit.findUnique({
        where: {
          householdId_periodKey: {
            householdId,
            periodKey: range.key,
          },
        },
      }),
      this.periodSpend(householdId, range.from, range.to),
      this.periodSaved(householdId, range.from, range.to),
    ]);

    return this.shape(
      range.key,
      range.from,
      range.to,
      row?.personalAmount != null ? Number(row.personalAmount) : null,
      row?.saveTargetAmount != null ? Number(row.saveTargetAmount) : null,
      spends,
      savedThisMonth,
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
    const saveTargetAmount =
      dto.saveTargetAmount === undefined ? undefined : dto.saveTargetAmount;

    if (personalAmount === undefined && saveTargetAmount === undefined) {
      throw new BadRequestException(
        'Provide personalAmount and/or saveTargetAmount',
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
    const nextSave =
      saveTargetAmount !== undefined
        ? saveTargetAmount
        : existing?.saveTargetAmount != null
          ? Number(existing.saveTargetAmount)
          : null;

    if (nextPersonal == null && nextSave == null) {
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
        saveTargetAmount: this.decOrNull(nextSave),
      },
      update: {
        personalAmount: this.decOrNull(nextPersonal),
        saveTargetAmount: this.decOrNull(nextSave),
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
