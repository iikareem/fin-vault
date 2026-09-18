import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';
import { AllocateSavingsGoalDto } from './dto/allocate-savings-goal.dto';
import { MoveSavingsGoalDto } from './dto/move-savings-goal.dto';

const GOAL_COLORS = [
  '#0f766e',
  '#0369a1',
  '#7c3aed',
  '#b45309',
  '#be123c',
  '#15803d',
] as const;

@Injectable()
export class SavingsGoalsService {
  constructor(
    private prisma: PrismaService,
    private accounts: AccountsService,
  ) {}

  async summary(householdId: string) {
    const [goals, wallets] = await Promise.all([
      this.prisma.savingsGoal.findMany({
        where: { householdId, archived: false },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.accounts.list(householdId),
    ]);

    const savings = wallets.find((a) => a.name === 'Savings');
    const current = wallets.find((a) => a.name === 'Current');
    const savingsBalance = Math.round((savings?.balance ?? 0) * 100) / 100;
    const currentBalance = Math.round((current?.balance ?? 0) * 100) / 100;

    const rows = goals.map((g) => this.mapGoal(g));
    const allocated = Math.round(
      rows.reduce((s, g) => s + g.savedAmount, 0) * 100,
    ) / 100;
    const free = Math.round(Math.max(0, savingsBalance - allocated) * 100) / 100;
    const totalTarget =
      Math.round(rows.reduce((s, g) => s + g.targetAmount, 0) * 100) / 100;

    return {
      savingsBalance,
      currentBalance,
      allocated,
      free,
      totalTarget,
      goals: rows,
      currentAccountId: current?.id ?? null,
      savingsAccountId: savings?.id ?? null,
    };
  }

  async create(householdId: string, userId: string, dto: CreateSavingsGoalDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');

    const color = dto.color ?? (await this.nextColor(householdId));
    await this.prisma.savingsGoal.create({
      data: {
        householdId,
        userId,
        name,
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        note: dto.note?.trim() ?? '',
        color,
      },
    });
    return this.summary(householdId);
  }

  async update(
    householdId: string,
    userId: string,
    id: string,
    dto: UpdateSavingsGoalDto,
  ) {
    const row = await this.requireOwnGoal(householdId, userId, id);
    if (dto.targetAmount != null && dto.targetAmount < Number(row.savedAmount)) {
      throw new BadRequestException(
        'Target cannot be less than what you already saved for this goal',
      );
    }
    await this.prisma.savingsGoal.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.targetAmount !== undefined
          ? { targetAmount: new Prisma.Decimal(dto.targetAmount) }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.archived !== undefined ? { archived: dto.archived } : {}),
      },
    });
    return this.summary(householdId);
  }

  async remove(householdId: string, userId: string, id: string) {
    await this.requireOwnGoal(householdId, userId, id);
    // Deleting only drops the label; cash stays in Savings.
    await this.prisma.savingsGoal.delete({ where: { id } });
    return this.summary(householdId);
  }

  async allocate(
    householdId: string,
    userId: string,
    id: string,
    dto: AllocateSavingsGoalDto,
  ) {
    const goal = await this.requireOwnGoal(householdId, userId, id);
    const amount = Math.round(dto.amount * 100) / 100;
    const occurredOn =
      dto.occurredOn ?? new Date().toISOString().slice(0, 10);

    const snap = await this.summary(householdId);
    if (!snap.savingsAccountId || !snap.currentAccountId) {
      throw new BadRequestException('Cash wallets missing');
    }

    if (dto.from === 'CURRENT') {
      if (amount > snap.currentBalance + 0.001) {
        throw new BadRequestException('Not enough money in current');
      }
      await this.accounts.transfer(householdId, 'PERSONAL', userId, {
        fromAccountId: snap.currentAccountId,
        toAccountId: snap.savingsAccountId,
        amount,
        occurredOn,
        note:
          dto.note?.trim() ||
          `Savings goal · ${goal.name}`,
      });
    } else {
      if (amount > snap.free + 0.001) {
        throw new BadRequestException(
          'Not enough free savings (already labeled for other goals)',
        );
      }
    }

    await this.prisma.savingsGoal.update({
      where: { id },
      data: {
        savedAmount: new Prisma.Decimal(
          Math.round((Number(goal.savedAmount) + amount) * 100) / 100,
        ),
      },
    });
    return this.summary(householdId);
  }

  /** Peel label only — money stays in Savings as free. */
  async release(
    householdId: string,
    userId: string,
    id: string,
    dto: MoveSavingsGoalDto,
  ) {
    const goal = await this.requireOwnGoal(householdId, userId, id);
    const amount = Math.round(dto.amount * 100) / 100;
    const saved = Number(goal.savedAmount);
    if (amount > saved + 0.001) {
      throw new BadRequestException('Not enough labeled on this goal');
    }
    await this.prisma.savingsGoal.update({
      where: { id },
      data: {
        savedAmount: new Prisma.Decimal(
          Math.round((saved - amount) * 100) / 100,
        ),
      },
    });
    return this.summary(householdId);
  }

  /** Peel label and move cash Savings → Current. */
  async toCurrent(
    householdId: string,
    userId: string,
    id: string,
    dto: MoveSavingsGoalDto,
  ) {
    const goal = await this.requireOwnGoal(householdId, userId, id);
    const amount = Math.round(dto.amount * 100) / 100;
    const saved = Number(goal.savedAmount);
    if (amount > saved + 0.001) {
      throw new BadRequestException('Not enough labeled on this goal');
    }

    const snap = await this.summary(householdId);
    if (!snap.savingsAccountId || !snap.currentAccountId) {
      throw new BadRequestException('Cash wallets missing');
    }

    const occurredOn =
      dto.occurredOn ?? new Date().toISOString().slice(0, 10);

    await this.accounts.transfer(householdId, 'PERSONAL', userId, {
      fromAccountId: snap.savingsAccountId,
      toAccountId: snap.currentAccountId,
      amount,
      occurredOn,
      note:
        dto.note?.trim() ||
        `From savings goal · ${goal.name}`,
    });

    await this.prisma.savingsGoal.update({
      where: { id },
      data: {
        savedAmount: new Prisma.Decimal(
          Math.round((saved - amount) * 100) / 100,
        ),
      },
    });
    return this.summary(householdId);
  }

  private mapGoal(g: {
    id: string;
    name: string;
    targetAmount: Prisma.Decimal;
    savedAmount: Prisma.Decimal;
    note: string;
    color: string;
    createdAt: Date;
  }) {
    const targetAmount = Math.round(Number(g.targetAmount) * 100) / 100;
    const savedAmount = Math.round(Number(g.savedAmount) * 100) / 100;
    const remaining = Math.round(Math.max(0, targetAmount - savedAmount) * 100) / 100;
    const pct =
      targetAmount > 0
        ? Math.min(100, Math.round((savedAmount / targetAmount) * 1000) / 10)
        : 0;
    return {
      id: g.id,
      name: g.name,
      targetAmount,
      savedAmount,
      remaining,
      pct,
      note: g.note,
      color: g.color,
      createdAt: g.createdAt.toISOString(),
    };
  }

  private async requireOwnGoal(
    householdId: string,
    userId: string,
    id: string,
  ) {
    const row = await this.prisma.savingsGoal.findFirst({
      where: { id, householdId, archived: false },
    });
    if (!row) throw new NotFoundException();
    if (row.userId !== userId) {
      throw new ForbiddenException('You can only change your own goals');
    }
    return row;
  }

  private async nextColor(householdId: string) {
    const count = await this.prisma.savingsGoal.count({
      where: { householdId, archived: false },
    });
    return GOAL_COLORS[count % GOAL_COLORS.length];
  }
}
