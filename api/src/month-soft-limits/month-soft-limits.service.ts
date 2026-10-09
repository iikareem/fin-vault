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
  isoLocal,
  shiftBudgetMonthKey,
} from '../common/calendar';
import { nonSpendCategoryFilter } from '../categories/non-spend-categories';
import {
  AccountsService,
  WALLET_TRANSFER_CATEGORY,
} from '../accounts/accounts.service';
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
  /** Organic month surplus (income − outflow). Unchanged by wallet transfers. */
  savedThisMonth: number;
  /** Surplus auto-moved Current → Savings for this plan. */
  autoMovedToSavings: number;
  save: SaveTrack | null;
  spendAllowance: SpendAllowanceTrack | null;
  overLimit: boolean;
};

@Injectable()
export class MonthSoftLimitsService {
  constructor(
    private prisma: PrismaService,
    private accounts: AccountsService,
  ) {}

  private planTransferNote(periodKey: string) {
    return `Month plan · ${periodKey}`;
  }

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
        category: { name: { not: WALLET_TRANSFER_CATEGORY } },
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

  private roundMoney(n: number) {
    return Math.round(n * 100) / 100;
  }

  /** Sum of Current→Savings wallet transfers tagged for this month plan. */
  private async sweptByTransferNotes(
    householdId: string,
    periodKey: string,
  ): Promise<number> {
    const current = await this.prisma.account.findFirst({
      where: {
        householdId,
        name: 'Current',
        archived: false,
        type: 'CASH',
      },
      select: { id: true },
    });
    if (!current) return 0;

    const agg = await this.prisma.transaction.aggregate({
      where: {
        householdId,
        accountId: current.id,
        type: 'EXPENSE',
        note: this.planTransferNote(periodKey),
        category: { name: WALLET_TRANSFER_CATEGORY },
      },
      _sum: { amount: true },
    });
    return this.roundMoney(Number(agg._sum?.amount ?? 0));
  }

  /**
   * Once the plan month starts: move the *previous* month's organic surplus
   * Current → Savings (one shot). No mid-month top-ups — wallets stay separate.
   * Wallet transfers do not change savedThisMonth / analytics.
   */
  private async syncAutoSaveToSavings(
    householdId: string,
    userId: string,
    rowId: string,
    periodKey: string,
    periodFrom: string,
    startDay: number,
    recordedSwept: number,
    alreadyDone: boolean,
  ): Promise<number> {
    const today = isoLocal(new Date());
    // Only on/after the first day of the picked month — never before.
    if (today < periodFrom) {
      return recordedSwept;
    }

    const byNotes = await this.sweptByTransferNotes(householdId, periodKey);
    const already = this.roundMoney(Math.max(recordedSwept, byNotes));

    // Already ran the start-of-month sweep — do not keep draining Current.
    if (alreadyDone || already > 0.001) {
      if (!alreadyDone || already > recordedSwept + 0.001) {
        await this.prisma.monthSoftLimit.update({
          where: { id: rowId },
          data: {
            autoSweptAmount: new Prisma.Decimal(already),
            autoSweepDone: true,
          },
        });
      }
      return already;
    }

    const prevKey = shiftBudgetMonthKey(periodKey, -1);
    const prevRange = budgetMonthRange(prevKey, startDay);
    const prevFlow = await this.cashFlow(
      householdId,
      prevRange.from,
      prevRange.to,
    );
    const target = this.roundMoney(Math.max(0, prevFlow.saved));

    const markDone = async (amount: number) => {
      await this.prisma.monthSoftLimit.update({
        where: { id: rowId },
        data: {
          autoSweptAmount: new Prisma.Decimal(amount),
          autoSweepDone: true,
        },
      });
      return amount;
    };

    if (target < 0.01) {
      return markDone(0);
    }

    const balances = await this.accounts.list(householdId);
    const current = balances.find((a) => a.name === 'Current' && !a.archived);
    const savings = balances.find((a) => a.name === 'Savings' && !a.archived);
    if (!current || !savings) {
      return markDone(0);
    }

    const amount = this.roundMoney(
      Math.min(target, Math.max(0, current.balance)),
    );
    if (amount < 0.01) {
      // Surplus already sitting in Savings / Current empty — count as done.
      return markDone(0);
    }

    try {
      await this.accounts.transfer(householdId, 'PERSONAL', userId, {
        fromAccountId: current.id,
        toAccountId: savings.id,
        amount,
        occurredOn: periodFrom,
        note: this.planTransferNote(periodKey),
      });
      return markDone(amount);
    } catch {
      return recordedSwept;
    }
  }

  private shape(
    periodKey: string,
    periodFrom: string,
    periodTo: string,
    saveTargetAmount: number | null,
    flow: { income: number; outflow: number; saved: number },
    spends: { spentAll: number; commitmentsSpend: number },
    autoMovedToSavings: number,
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
      autoMovedToSavings,
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

    const saveTarget =
      row?.saveTargetAmount != null ? Number(row.saveTargetAmount) : null;
    let autoMoved = row ? Number(row.autoSweptAmount) : 0;

    if (row && saveTarget != null && saveTarget > 0) {
      autoMoved = await this.syncAutoSaveToSavings(
        householdId,
        userId,
        row.id,
        range.key,
        range.from,
        startDay,
        autoMoved,
        row.autoSweepDone,
      );
    }

    return this.shape(
      range.key,
      range.from,
      range.to,
      saveTarget,
      flow,
      spends,
      autoMoved,
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
