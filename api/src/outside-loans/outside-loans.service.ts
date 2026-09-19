import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOutsideLoanDto } from './dto/create-outside-loan.dto';
import { CollectOutsideLoanDto } from './dto/collect-outside-loan.dto';
import { nameArFor } from '../categories/category-labels';

const CATS = {
  lend: { name: 'Outside loan', kind: 'EXPENSE' as const, color: '#b91c1c' },
  collect: { name: 'Loan collected', kind: 'INCOME' as const, color: '#15803d' },
  borrow: { name: 'Loan received', kind: 'INCOME' as const, color: '#0369a1' },
  repay: { name: 'Loan repaid', kind: 'EXPENSE' as const, color: '#c2410c' },
};

@Injectable()
export class OutsideLoansService {
  constructor(private prisma: PrismaService) {}

  private remaining(
    original: Prisma.Decimal,
    collections: { amount: Prisma.Decimal }[],
  ) {
    const paid = collections.reduce((s, c) => s + Number(c.amount), 0);
    return Number(original) - paid;
  }

  private shape(loan: {
    id: string;
    householdId: string;
    userId: string;
    personName: string;
    direction: 'LEND' | 'BORROW';
    originalAmount: Prisma.Decimal;
    note: string;
    occurredOn: Date;
    status: string;
    accountId: string;
    createdAt: Date;
    collections: {
      amount: Prisma.Decimal;
      occurredOn: Date;
      note: string;
      id: string;
    }[];
    account?: { id: string; name: string };
  }) {
    const remaining = this.remaining(loan.originalAmount, loan.collections);
    return {
      id: loan.id,
      householdId: loan.householdId,
      userId: loan.userId,
      personName: loan.personName,
      direction: loan.direction,
      note: loan.note,
      occurredOn: loan.occurredOn,
      status: remaining <= 0.001 ? 'SETTLED' : loan.status,
      accountId: loan.accountId,
      account: loan.account,
      createdAt: loan.createdAt,
      originalAmount: Number(loan.originalAmount),
      remaining: Math.max(0, remaining),
      settledAmount: Number(loan.originalAmount) - Math.max(0, remaining),
      collected: Number(loan.originalAmount) - Math.max(0, remaining),
      collections: loan.collections.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        occurredOn: c.occurredOn,
        note: c.note,
      })),
    };
  }

  private async ensureCategory(
    tx: Prisma.TransactionClient,
    householdId: string,
    name: string,
    kind: 'EXPENSE' | 'INCOME',
    color: string,
  ) {
    const existing = await tx.category.findFirst({
      where: { householdId, name, kind },
    });
    if (existing) return existing;
    return tx.category.create({
      data: { householdId, name, nameAr: nameArFor(name), kind, color },
    });
  }

  private async cashWallet(
    tx: Prisma.TransactionClient,
    householdId: string,
    accountId: string,
  ) {
    const cash = await tx.account.findFirst({
      where: {
        id: accountId,
        householdId,
        type: 'CASH',
        archived: false,
      },
    });
    if (!cash) throw new BadRequestException('Pick a cash wallet');
    return cash;
  }

  async list(householdId: string, userId: string) {
    const loans = await this.prisma.outsideLoan.findMany({
      where: { householdId, userId },
      include: {
        account: { select: { id: true, name: true } },
        collections: { orderBy: { occurredOn: 'desc' } },
      },
      orderBy: [{ status: 'asc' }, { occurredOn: 'desc' }],
    });
    const shaped = loans.map((l) => this.shape(l));
    const open = shaped.filter((l) => l.status !== 'SETTLED');
    const settled = shaped.filter((l) => l.status === 'SETTLED');
    return {
      open,
      settled,
      owedToYou: open
        .filter((l) => l.direction === 'LEND')
        .reduce((s, l) => s + l.remaining, 0),
      youOwe: open
        .filter((l) => l.direction === 'BORROW')
        .reduce((s, l) => s + l.remaining, 0),
    };
  }

  async create(householdId: string, userId: string, dto: CreateOutsideLoanDto) {
    const personName = dto.personName.trim();
    if (!personName) throw new BadRequestException('Enter a name');
    const direction = dto.direction === 'BORROW' ? 'BORROW' : 'LEND';
    const openCat = direction === 'LEND' ? CATS.lend : CATS.borrow;

    const loan = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.cashWallet(tx, householdId, dto.accountId);
      const category = await this.ensureCategory(
        tx,
        householdId,
        openCat.name,
        openCat.kind,
        openCat.color,
      );
      const openTx = await tx.transaction.create({
        data: {
          householdId,
          accountId: wallet.id,
          categoryId: category.id,
          userId,
          type: openCat.kind,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: dto.note?.trim()
            ? `${personName} · ${dto.note.trim()}`
            : direction === 'LEND'
              ? `Lent to ${personName}`
              : `Borrowed from ${personName}`,
        },
      });
      return tx.outsideLoan.create({
        data: {
          householdId,
          userId,
          personName,
          direction,
          originalAmount: new Prisma.Decimal(dto.amount),
          note: dto.note?.trim() ?? '',
          occurredOn: new Date(dto.occurredOn),
          accountId: wallet.id,
          lendTxId: openTx.id,
        },
        include: {
          account: { select: { id: true, name: true } },
          collections: true,
        },
      });
    });
    return this.shape(loan);
  }

  async collect(
    householdId: string,
    userId: string,
    loanId: string,
    dto: CollectOutsideLoanDto,
  ) {
    const existing = await this.prisma.outsideLoan.findFirst({
      where: { id: loanId, householdId, userId },
      include: { collections: true },
    });
    if (!existing) throw new NotFoundException('Loan not found');

    const remaining = this.remaining(
      existing.originalAmount,
      existing.collections,
    );
    if (remaining <= 0.001) {
      throw new BadRequestException('This loan is already settled');
    }
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException('Amount is more than remaining');
    }

    const settleCat =
      existing.direction === 'BORROW' ? CATS.repay : CATS.collect;

    const loan = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.cashWallet(tx, householdId, dto.accountId);
      const category = await this.ensureCategory(
        tx,
        householdId,
        settleCat.name,
        settleCat.kind,
        settleCat.color,
      );
      const settleTx = await tx.transaction.create({
        data: {
          householdId,
          accountId: wallet.id,
          categoryId: category.id,
          userId,
          type: settleCat.kind,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: dto.note?.trim()
            ? `${existing.personName} · ${dto.note.trim()}`
            : existing.direction === 'BORROW'
              ? `Repaid ${existing.personName}`
              : `Collected from ${existing.personName}`,
        },
      });
      await tx.outsideLoanCollection.create({
        data: {
          loanId: existing.id,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: dto.note?.trim() ?? '',
          accountId: wallet.id,
          collectTxId: settleTx.id,
        },
      });
      const nextRemaining = remaining - dto.amount;
      if (nextRemaining <= 0.001) {
        await tx.outsideLoan.update({
          where: { id: existing.id },
          data: { status: 'SETTLED' },
        });
      }
      return tx.outsideLoan.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          account: { select: { id: true, name: true } },
          collections: { orderBy: { occurredOn: 'desc' } },
        },
      });
    });
    return this.shape(loan);
  }
}
