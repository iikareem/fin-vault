import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCoverDto } from './dto/create-cover.dto';
import { CreateCoverRepaymentDto } from './dto/create-cover-repayment.dto';

@Injectable()
export class CoversService {
  constructor(private prisma: PrismaService) {}

  private remaining(
    amount: Prisma.Decimal,
    repayments: { amount: Prisma.Decimal }[],
  ) {
    const paid = repayments.reduce((s, r) => s + Number(r.amount), 0);
    return Number(amount) - paid;
  }

  private statusFor(remaining: number, original: number) {
    if (remaining <= 0.001) return 'SETTLED' as const;
    if (remaining < original) return 'PARTIAL' as const;
    return 'OPEN' as const;
  }

  private shape(cover: {
    id: string;
    householdId: string;
    memberId: string;
    categoryId: string;
    amount: Prisma.Decimal;
    occurredOn: Date;
    note: string;
    status: string;
    createdAt: Date;
    repayments: { amount: Prisma.Decimal }[];
    member?: { id: string; name: string };
    category?: { id: string; name: string; color: string };
  }) {
    const remaining = this.remaining(cover.amount, cover.repayments);
    return {
      id: cover.id,
      householdId: cover.householdId,
      memberId: cover.memberId,
      categoryId: cover.categoryId,
      occurredOn: cover.occurredOn,
      note: cover.note,
      status: this.statusFor(remaining, Number(cover.amount)),
      createdAt: cover.createdAt,
      member: cover.member,
      category: cover.category,
      repayments: cover.repayments,
      amount: Number(cover.amount),
      remaining: Math.max(0, remaining),
      repaid: Number(cover.amount) - Math.max(0, remaining),
    };
  }

  async list(householdId: string) {
    const covers = await this.prisma.houseCover.findMany({
      where: { householdId },
      include: {
        member: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        repayments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return covers.map((c) => this.shape(c));
  }

  async create(householdId: string, adminId: string, dto: CreateCoverDto) {
    const member = await this.prisma.membership.findFirst({
      where: { householdId, userId: dto.toUserId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!member) {
      throw new BadRequestException('That person is not in this house');
    }

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, householdId, kind: 'EXPENSE' },
    });
    if (!category) throw new BadRequestException('Pick an expense category');
    if (
      category.name === 'Member payback' ||
      category.name === 'Given to member' ||
      category.name === 'Allowance'
    ) {
      throw new BadRequestException('Pick what the house paid for');
    }

    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, householdId, archived: false },
    });
    if (!account) throw new BadRequestException('Unknown house wallet');

    const note = dto.note?.trim() ?? '';
    const houseNote = note
      ? `${member.user.name} · ${note}`
      : `For ${member.user.name}`;

    return this.prisma.$transaction(async (tx) => {
      const houseTx = await tx.transaction.create({
        data: {
          householdId,
          userId: adminId,
          accountId: account.id,
          categoryId: category.id,
          type: 'EXPENSE',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: houseNote,
        },
      });
      const cover = await tx.houseCover.create({
        data: {
          householdId,
          memberId: dto.toUserId,
          categoryId: category.id,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note,
          houseTxId: houseTx.id,
        },
        include: {
          member: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          repayments: true,
        },
      });
      return this.shape(cover);
    });
  }

  async repay(
    householdId: string,
    actorId: string,
    role: string,
    coverId: string,
    dto: CreateCoverRepaymentDto,
  ) {
    const cover = await this.prisma.houseCover.findFirst({
      where: { id: coverId, householdId },
      include: { repayments: true, member: true, category: true },
    });
    if (!cover) throw new NotFoundException();
    if (role !== 'ADMIN' && cover.memberId !== actorId) {
      throw new ForbiddenException('You can only repay your own balance');
    }
    const remaining = this.remaining(cover.amount, cover.repayments);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException('That is more than what is still owed');
    }
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, householdId, archived: false },
    });
    if (!account) throw new BadRequestException('Unknown house wallet');

    return this.prisma.$transaction(async (tx) => {
      const incomeCat = await this.ensureCategory(
        tx,
        householdId,
        'Member repayment',
        'INCOME',
        '#0f766e',
      );
      const houseTx = await tx.transaction.create({
        data: {
          householdId,
          userId: actorId,
          accountId: dto.accountId,
          categoryId: incomeCat.id,
          type: 'INCOME',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note:
            dto.note ??
            `Repayment from ${cover.member.name}${
              cover.note ? ` · ${cover.note}` : ''
            }`,
        },
      });
      const personalTxId = await this.recordPersonalExpense(
        tx,
        cover.memberId,
        dto.amount,
        dto.occurredOn,
        dto.note ?? 'Paid back to the house',
      );
      await tx.coverRepayment.create({
        data: {
          coverId,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          accountId: dto.accountId,
          houseTxId: houseTx.id,
          personalTxId,
          recordedByUserId: actorId,
        },
      });
      const left = remaining - dto.amount;
      await tx.houseCover.update({
        where: { id: coverId },
        data: { status: this.statusFor(left, Number(cover.amount)) },
      });
      const updated = await tx.houseCover.findUniqueOrThrow({
        where: { id: coverId },
        include: {
          member: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          repayments: true,
        },
      });
      return this.shape(updated);
    });
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
      data: { householdId, name, kind, color },
    });
  }

  private async personalCash(tx: Prisma.TransactionClient, userId: string) {
    const membership = await tx.membership.findFirst({
      where: { userId, household: { kind: 'PERSONAL' } },
    });
    if (!membership) return null;
    const cash = await tx.account.findFirst({
      where: {
        householdId: membership.householdId,
        type: 'CASH',
        archived: false,
        name: { in: ['Current', 'Cash'] },
      },
    });
    if (!cash) return null;
    return { householdId: membership.householdId, accountId: cash.id };
  }

  private async recordPersonalExpense(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    occurredOn: string,
    note: string,
  ) {
    const books = await this.personalCash(tx, userId);
    if (!books) return null;
    const category = await this.ensureCategory(
      tx,
      books.householdId,
      'To the house',
      'EXPENSE',
      '#44403c',
    );
    const created = await tx.transaction.create({
      data: {
        householdId: books.householdId,
        accountId: books.accountId,
        categoryId: category.id,
        userId,
        type: 'EXPENSE',
        amount: new Prisma.Decimal(amount),
        occurredOn: new Date(occurredOn),
        note,
      },
    });
    return created.id;
  }
}
