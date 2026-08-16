import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { HouseholdKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { TransferAccountsDto } from './dto/transfer-accounts.dto';

export const WALLET_TRANSFER_CATEGORY = 'Wallet transfer';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async list(householdId: string) {
    await this.ensureCashPots(householdId);
    const accounts = await this.prisma.account.findMany({
      where: { householdId, archived: false, type: 'CASH' },
      orderBy: { name: 'asc' },
    });
    const sums = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { householdId, accountId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
    });
    return accounts.map((account) => {
      const income = sums.find((s) => s.accountId === account.id && s.type === 'INCOME');
      const expense = sums.find((s) => s.accountId === account.id && s.type === 'EXPENSE');
      const payback = sums.find(
        (s) => s.accountId === account.id && s.type === 'REIMBURSEMENT',
      );
      const opening = Number(account.openingBalance);
      const inAmt = Number(income?._sum.amount ?? 0);
      const outAmt = Number(expense?._sum.amount ?? 0);
      const paybackAmt = Number(payback?._sum.amount ?? 0);
      return {
        ...account,
        openingBalance: opening,
        balance: opening + inAmt - outAmt - paybackAmt,
      };
    });
  }

  private async ensureCashPots(householdId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { householdId },
    });
    const cash = accounts.find((a) => a.name === 'Cash' && !a.archived);
    const current = accounts.find((a) => a.name === 'Current' && !a.archived);
    const savings = accounts.find((a) => a.name === 'Savings' && !a.archived);
    if (cash && !current) {
      await this.prisma.account.update({
        where: { id: cash.id },
        data: { name: 'Current', type: 'CASH' },
      });
    } else if (!current && !cash) {
      await this.prisma.account.create({
        data: { householdId, name: 'Current', type: 'CASH' },
      });
    }
    if (!savings) {
      await this.prisma.account.create({
        data: { householdId, name: 'Savings', type: 'CASH' },
      });
    }
    const banks = accounts.filter((a) => a.type === 'BANK' && !a.archived);
    if (banks.length) {
      await this.prisma.account.updateMany({
        where: { id: { in: banks.map((a) => a.id) } },
        data: { archived: true },
      });
    }
  }

  create(householdId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        householdId,
        name: dto.name,
        type: dto.type ?? 'CASH',
        openingBalance: new Prisma.Decimal(dto.openingBalance ?? 0),
      },
    });
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
          kind,
          color: '#57534e',
        },
      });
    };
    const [expense, income] = await Promise.all([
      ensure('EXPENSE'),
      ensure('INCOME'),
    ]);
    return { expense, income };
  }

  async transfer(
    householdId: string,
    kind: HouseholdKind,
    userId: string,
    dto: TransferAccountsDto,
  ) {
    if (kind !== 'PERSONAL') {
      throw new ForbiddenException('Transfers are only for your own money');
    }
    if (dto.fromAccountId === dto.toAccountId) {
      throw new BadRequestException('Pick two different wallets');
    }
    await this.ensureCashPots(householdId);
    const [from, to] = await Promise.all([
      this.prisma.account.findFirst({
        where: {
          id: dto.fromAccountId,
          householdId,
          archived: false,
          type: 'CASH',
        },
      }),
      this.prisma.account.findFirst({
        where: {
          id: dto.toAccountId,
          householdId,
          archived: false,
          type: 'CASH',
        },
      }),
    ]);
    if (!from || !to) {
      throw new BadRequestException('Pick current or savings');
    }

    const balances = await this.list(householdId);
    const fromBal = balances.find((a) => a.id === from.id)?.balance ?? 0;
    if (dto.amount > fromBal + 0.001) {
      throw new BadRequestException('Not enough money in that wallet');
    }

    const cats = await this.ensureTransferCategories(householdId);
    const note =
      dto.note?.trim() || `Transfer · ${from.name} → ${to.name}`;

    const [outTx, inTx] = await this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          householdId,
          userId,
          accountId: from.id,
          categoryId: cats.expense.id,
          type: 'EXPENSE',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note,
        },
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: {
            select: { id: true, name: true, color: true, kind: true },
          },
        },
      }),
      this.prisma.transaction.create({
        data: {
          householdId,
          userId,
          accountId: to.id,
          categoryId: cats.income.id,
          type: 'INCOME',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note,
        },
        include: {
          account: { select: { id: true, name: true, type: true } },
          category: {
            select: { id: true, name: true, color: true, kind: true },
          },
        },
      }),
    ]);

    return {
      amount: dto.amount,
      from: { id: from.id, name: from.name },
      to: { id: to.id, name: to.name },
      out: outTx,
      in: inTx,
    };
  }
}
