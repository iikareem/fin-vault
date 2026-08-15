import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';

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
}
