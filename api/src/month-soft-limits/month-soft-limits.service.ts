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
  shiftBudgetMonthKey,
} from '../common/calendar';
import { nonSpendCategoryFilter } from '../categories/non-spend-categories';
import { nameArFor } from '../categories/category-labels';
import { UpsertMonthSoftLimitDto } from './dto/upsert-month-soft-limit.dto';

const WALLET_TRANSFER_CATEGORY = 'Wallet transfer';
const MONTH_SAVE_NOTE_PREFIX = 'Month save · ';

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

export type MonthSaveSweepResult = {
  periodKey: string;
  previousPeriodKey: string;
  autoSweptAmount: number;
  autoSweepDone: boolean;
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
  /** Amount moved Current → Savings for the closed period (this period's start). */
  autoSweptAmount: number;
  /** Closed period key the sweep covers (always set once sweep has run). */
  autoSweepPreviousPeriodKey: string | null;
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
      select: { id: true, name: true },
    });
    if (accounts.length === 0) {
      return { income: 0, outflow: 0, saved: 0 };
    }

    // Income counts on Current + Savings; outflow only on everyday wallets.
    // Spending from Savings must not reduce save progress or spend room.
    const currentIds = new Set(
      accounts
        .filter((a) => a.name === 'Current' || a.name === 'Cash')
        .map((a) => a.id),
    );
    const ids = accounts.map((a) => a.id);

    const rows = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: {
        householdId,
        accountId: { in: ids },
        occurredOn: { gte: dateOnlyUtc(from), lte: dateOnlyUtc(to) },
        category: { name: { not: 'Wallet transfer' } },
        type: { in: ['INCOME', 'EXPENSE', 'REIMBURSEMENT'] },
      },
      _sum: { amount: true },
    });

    let income = 0;
    let outflow = 0;
    for (const row of rows) {
      const amount = Number(row._sum?.amount ?? 0);
      if (row.type === 'INCOME') {
        income += amount;
      } else if (
        (row.type === 'EXPENSE' || row.type === 'REIMBURSEMENT') &&
        currentIds.has(row.accountId)
      ) {
        outflow += amount;
      }
    }
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
      account: { name: { not: 'Savings' } },
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
    sweep: { autoSweptAmount: number; previousPeriodKey: string | null },
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
      autoSweptAmount: sweep.autoSweptAmount,
      autoSweepPreviousPeriodKey: sweep.previousPeriodKey,
    };
  }

  private money2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private monthSaveNote(previousPeriodKey: string) {
    return `${MONTH_SAVE_NOTE_PREFIX}${previousPeriodKey}`;
  }

  private async ensureCashWallets(householdId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId },
    });
    let current = accounts.find((a) => a.name === 'Current' && !a.archived);
    const legacyCash = accounts.find((a) => a.name === 'Cash' && !a.archived);
    let savings = accounts.find((a) => a.name === 'Savings' && !a.archived);

    if (legacyCash && !current) {
      current = await this.prisma.account.update({
        where: { id: legacyCash.id },
        data: { name: 'Current', type: 'CASH' },
      });
    } else if (!current && !legacyCash) {
      current = await this.prisma.account.create({
        data: { householdId, name: 'Current', type: 'CASH' },
      });
    }
    if (!savings) {
      savings = await this.prisma.account.create({
        data: { householdId, name: 'Savings', type: 'CASH' },
      });
    }
    return { current: current!, savings };
  }

  private async walletBalance(accountId: string, openingBalance: unknown) {
    const sums = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { accountId },
      _sum: { amount: true },
    });
    const amt = (type: string) =>
      Number(sums.find((s) => s.type === type)?._sum.amount ?? 0);
    return (
      Number(openingBalance) +
      amt('INCOME') -
      amt('EXPENSE') -
      amt('REIMBURSEMENT')
    );
  }

  private async ensureTransferCategories(householdId: string) {
    const ensure = async (kind: 'EXPENSE' | 'INCOME') => {
      const existing = await this.prisma.category.findFirst({
        where: { householdId, name: WALLET_TRANSFER_CATEGORY, kind },
      });
      if (existing) return existing;
      return this.prisma.category.create({
        data: {
          householdId,
          name: WALLET_TRANSFER_CATEGORY,
          nameAr: nameArFor(WALLET_TRANSFER_CATEGORY),
          kind,
          color: '#57534e',
          seedKey: WALLET_TRANSFER_CATEGORY,
        },
      });
    };
    const [expense, income] = await Promise.all([
      ensure('EXPENSE'),
      ensure('INCOME'),
    ]);
    return { expense, income };
  }

  /**
   * One-shot at the start of a personal budget period: move the previous
   * period's positive saved amount (income − outflow) from Current → Savings,
   * capped by Current's balance. Idempotent via MonthSoftLimit.autoSweepDone.
   */
  async applyMonthStartSaveSweep(
    householdId: string,
    userId: string,
  ): Promise<MonthSaveSweepResult> {
    const startDay = await this.resolveStartDay(userId);
    const current = budgetMonthRange(new Date(), startDay);
    const previousPeriodKey = shiftBudgetMonthKey(current.key, -1);
    const note = this.monthSaveNote(previousPeriodKey);

    const existing = await this.prisma.monthSoftLimit.upsert({
      where: {
        householdId_periodKey: {
          householdId,
          periodKey: current.key,
        },
      },
      create: {
        householdId,
        periodKey: current.key,
        saveTargetAmount: null,
        autoSweptAmount: 0,
        autoSweepDone: false,
      },
      update: {},
    });

    if (existing.autoSweepDone) {
      return {
        periodKey: current.key,
        previousPeriodKey,
        autoSweptAmount: Number(existing.autoSweptAmount),
        autoSweepDone: true,
      };
    }

    // Claim the one-shot so parallel Home requests cannot double-transfer.
    const claimed = await this.prisma.monthSoftLimit.updateMany({
      where: { id: existing.id, autoSweepDone: false },
      data: { autoSweepDone: true, autoSweptAmount: 0 },
    });
    if (claimed.count === 0) {
      const row = await this.prisma.monthSoftLimit.findUniqueOrThrow({
        where: { id: existing.id },
      });
      return {
        periodKey: current.key,
        previousPeriodKey,
        autoSweptAmount: Number(row.autoSweptAmount),
        autoSweepDone: true,
      };
    }

    try {
      const priorTx = await this.prisma.transaction.findFirst({
        where: {
          householdId,
          note,
          type: 'EXPENSE',
          category: { name: WALLET_TRANSFER_CATEGORY },
        },
        select: { amount: true },
      });
      if (priorTx) {
        const amount = this.money2(Number(priorTx.amount));
        await this.prisma.monthSoftLimit.update({
          where: { id: existing.id },
          data: { autoSweptAmount: new Prisma.Decimal(amount) },
        });
        return {
          periodKey: current.key,
          previousPeriodKey,
          autoSweptAmount: amount,
          autoSweepDone: true,
        };
      }

      const prevRange = budgetMonthRange(previousPeriodKey, startDay);
      const flow = await this.cashFlow(
        householdId,
        prevRange.from,
        prevRange.to,
      );
      const saved = this.money2(Math.max(0, flow.saved));

      const { current: currentWallet, savings } =
        await this.ensureCashWallets(householdId);
      const currentBal = this.money2(
        await this.walletBalance(
          currentWallet.id,
          currentWallet.openingBalance,
        ),
      );
      const amount = this.money2(Math.min(saved, Math.max(0, currentBal)));

      if (amount > 0.001) {
        const cats = await this.ensureTransferCategories(householdId);
        const occurredOn = dateOnlyUtc(current.from);
        await this.prisma.$transaction([
          this.prisma.transaction.create({
            data: {
              householdId,
              userId,
              accountId: currentWallet.id,
              categoryId: cats.expense.id,
              type: 'EXPENSE',
              amount: new Prisma.Decimal(amount),
              occurredOn,
              note,
            },
          }),
          this.prisma.transaction.create({
            data: {
              householdId,
              userId,
              accountId: savings.id,
              categoryId: cats.income.id,
              type: 'INCOME',
              amount: new Prisma.Decimal(amount),
              occurredOn,
              note,
            },
          }),
        ]);
      }

      await this.prisma.monthSoftLimit.update({
        where: { id: existing.id },
        data: { autoSweptAmount: new Prisma.Decimal(amount) },
      });

      return {
        periodKey: current.key,
        previousPeriodKey,
        autoSweptAmount: amount,
        autoSweepDone: true,
      };
    } catch (err) {
      // Allow a later request to retry if the transfer failed mid-way.
      await this.prisma.monthSoftLimit.update({
        where: { id: existing.id },
        data: { autoSweepDone: false, autoSweptAmount: 0 },
      });
      throw err;
    }
  }

  async getStatus(
    householdId: string,
    userId: string,
    periodKey?: string,
  ): Promise<MonthSoftLimitStatus> {
    const startDay = await this.resolveStartDay(userId);
    const range = this.resolvePeriod(periodKey, startDay);
    const currentKey = budgetMonthRange(new Date(), startDay).key;

    let sweep = {
      autoSweptAmount: 0,
      previousPeriodKey: null as string | null,
    };
    if (range.key === currentKey) {
      const result = await this.applyMonthStartSaveSweep(householdId, userId);
      sweep = {
        autoSweptAmount: result.autoSweptAmount,
        previousPeriodKey: result.previousPeriodKey,
      };
    } else {
      const rowOnly = await this.prisma.monthSoftLimit.findUnique({
        where: {
          householdId_periodKey: {
            householdId,
            periodKey: range.key,
          },
        },
      });
      if (rowOnly?.autoSweepDone) {
        sweep = {
          autoSweptAmount: Number(rowOnly.autoSweptAmount),
          previousPeriodKey: shiftBudgetMonthKey(range.key, -1),
        };
      }
    }

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
      sweep,
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

    // Keep the row when clearing the target so autoSweepDone is not lost.
    if (dto.saveTargetAmount == null) {
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
          saveTargetAmount: null,
        },
        update: { saveTargetAmount: null },
      });
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

    const existing = await this.prisma.monthSoftLimit.findUnique({
      where: {
        householdId_periodKey: {
          householdId,
          periodKey: range.key,
        },
      },
    });
    if (!existing || existing.saveTargetAmount == null) {
      throw new NotFoundException('No month plan set for this period');
    }

    // Null the target; never delete the row (preserves auto-sweep state).
    await this.prisma.monthSoftLimit.update({
      where: { id: existing.id },
      data: { saveTargetAmount: null },
    });

    return this.getStatus(householdId, userId, range.key);
  }
}
