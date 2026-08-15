import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdAccessService } from '../households/household-access.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { CreateReimbursementDto } from './dto/create-reimbursement.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';

@Injectable()
export class ClaimsService {
  constructor(
    private prisma: PrismaService,
    private access: HouseholdAccessService,
  ) {}

  private remaining(
    amount: Prisma.Decimal,
    reimbursements: { amount: Prisma.Decimal }[],
  ) {
    const paid = reimbursements.reduce((s, r) => s + Number(r.amount), 0);
    return Number(amount) - paid;
  }

  private statusFor(remaining: number, original: number) {
    if (remaining <= 0.001) return 'REIMBURSED' as const;
    if (remaining < original) return 'PARTIAL' as const;
    return 'OPEN' as const;
  }

  private shape(claim: {
    id: string;
    householdId: string;
    memberId: string;
    categoryId: string;
    amount: Prisma.Decimal;
    occurredOn: Date;
    note: string;
    status: string;
    createdAt: Date;
    reimbursements: { amount: Prisma.Decimal }[];
    member?: { id: string; name: string };
    category?: { id: string; name: string; color: string };
  }) {
    const remaining = this.remaining(claim.amount, claim.reimbursements);
    return {
      id: claim.id,
      householdId: claim.householdId,
      memberId: claim.memberId,
      categoryId: claim.categoryId,
      occurredOn: claim.occurredOn,
      note: claim.note,
      status: this.statusFor(remaining, Number(claim.amount)),
      createdAt: claim.createdAt,
      member: claim.member,
      category: claim.category,
      reimbursements: claim.reimbursements,
      amount: Number(claim.amount),
      remaining: Math.max(0, remaining),
      reimbursed: Number(claim.amount) - Math.max(0, remaining),
    };
  }

  async list(householdId: string) {
    const claims = await this.prisma.houseClaim.findMany({
      where: { householdId },
      include: {
        member: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        reimbursements: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return claims.map((c) => this.shape(c));
  }

  async create(householdId: string, memberId: string, dto: CreateClaimDto) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, householdId, kind: 'EXPENSE' },
    });
    if (!category) throw new BadRequestException('Pick an expense category');
    if (category.name === 'Member payback' || category.name === 'Given to member' || category.name === 'Allowance') {
      throw new BadRequestException('That category is for admin payback only');
    }

    return this.prisma.$transaction(async (tx) => {
      const personalTxId = await this.recordPersonalExpense(
        tx,
        memberId,
        dto.amount,
        dto.occurredOn,
        category.name,
        category.color,
        dto.note ?? '',
      );
      const claim = await tx.houseClaim.create({
        data: {
          householdId,
          memberId,
          categoryId: dto.categoryId,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: dto.note ?? '',
          personalTxId,
        },
        include: {
          member: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          reimbursements: true,
        },
      });
      return this.shape(claim);
    });
  }

  async reimburse(
    householdId: string,
    adminId: string,
    claimId: string,
    dto: CreateReimbursementDto,
  ) {
    const claim = await this.prisma.houseClaim.findFirst({
      where: { id: claimId, householdId },
      include: { reimbursements: true, member: true },
    });
    if (!claim) throw new NotFoundException();
    const remaining = this.remaining(claim.amount, claim.reimbursements);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException('That is more than what is still owed');
    }
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, householdId, archived: false },
    });
    if (!account) throw new BadRequestException('Unknown house wallet');
    const paybackCategoryId = await this.access.paybackCategoryId(householdId);

    return this.prisma.$transaction(async (tx) => {
      const walletTx = await tx.transaction.create({
        data: {
          householdId,
          userId: adminId,
          accountId: dto.accountId,
          categoryId: paybackCategoryId,
          type: 'REIMBURSEMENT',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note:
            dto.note ??
            `Payback to ${claim.member.name}${claim.note ? ` · ${claim.note}` : ''}`,
        },
      });
      const personalTxId = await this.recordPersonalIncome(
        tx,
        claim.memberId,
        dto.amount,
        dto.occurredOn,
        dto.note ?? `Payback from the house`,
      );
      await tx.reimbursement.create({
        data: {
          claimId,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          accountId: dto.accountId,
          transactionId: walletTx.id,
          personalTxId,
          recordedByUserId: adminId,
        },
      });
      const left = remaining - dto.amount;
      await tx.houseClaim.update({
        where: { id: claimId },
        data: { status: this.statusFor(left, Number(claim.amount)) },
      });
      const updated = await tx.houseClaim.findUniqueOrThrow({
        where: { id: claimId },
        include: {
          member: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          reimbursements: true,
        },
      });
      return this.shape(updated);
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

  private async ensurePersonalCategory(
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

  private async recordPersonalExpense(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    occurredOn: string,
    categoryName: string,
    color: string,
    note: string,
  ) {
    const books = await this.personalCash(tx, userId);
    if (!books) return null;
    const category = await this.ensurePersonalCategory(
      tx,
      books.householdId,
      categoryName,
      'EXPENSE',
      color,
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
        note: note.trim() || 'Paid for the house',
      },
    });
    return created.id;
  }

  private async recordPersonalIncome(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    occurredOn: string,
    note: string,
  ) {
    const books = await this.personalCash(tx, userId);
    if (!books) return null;
    const category = await this.ensurePersonalCategory(
      tx,
      books.householdId,
      'From the house',
      'INCOME',
      '#0f766e',
    );
    const created = await tx.transaction.create({
      data: {
        householdId: books.householdId,
        accountId: books.accountId,
        categoryId: category.id,
        userId,
        type: 'INCOME',
        amount: new Prisma.Decimal(amount),
        occurredOn: new Date(occurredOn),
        note,
      },
    });
    return created.id;
  }

  async update(
    householdId: string,
    userId: string,
    role: string,
    claimId: string,
    dto: UpdateClaimDto,
  ) {
    const claim = await this.prisma.houseClaim.findFirst({
      where: { id: claimId, householdId },
      include: { reimbursements: true },
    });
    if (!claim) throw new NotFoundException();
    if (claim.memberId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own payment');
    }
    if (claim.reimbursements.length > 0) {
      throw new BadRequestException('This was already paid back');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.HouseClaimUpdateInput = {};
      if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.occurredOn) data.occurredOn = new Date(dto.occurredOn);
      if (dto.categoryId) {
        const category = await tx.category.findFirst({
          where: { id: dto.categoryId, householdId, kind: 'EXPENSE' },
        });
        if (!category) throw new BadRequestException('Pick an expense category');
        data.category = { connect: { id: dto.categoryId } };
      }
      await tx.houseClaim.update({ where: { id: claimId }, data });
      if (claim.personalTxId && (dto.amount !== undefined || dto.occurredOn || dto.note !== undefined)) {
        await tx.transaction.update({
          where: { id: claim.personalTxId },
          data: {
            ...(dto.amount !== undefined
              ? { amount: new Prisma.Decimal(dto.amount) }
              : {}),
            ...(dto.occurredOn ? { occurredOn: new Date(dto.occurredOn) } : {}),
            ...(dto.note !== undefined ? { note: dto.note } : {}),
          },
        });
      }
      return tx.houseClaim.findFirstOrThrow({
        where: { id: claimId },
        include: {
          member: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          reimbursements: true,
        },
      });
    });
    return this.shape(updated);
  }

  async remove(
    householdId: string,
    userId: string,
    role: string,
    claimId: string,
  ) {
    const claim = await this.prisma.houseClaim.findFirst({
      where: { id: claimId, householdId },
      include: { reimbursements: true },
    });
    if (!claim) throw new NotFoundException();
    if (claim.memberId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own payment');
    }
    if (claim.reimbursements.length > 0) {
      throw new BadRequestException('This was already paid back');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.houseClaim.delete({ where: { id: claimId } });
      if (claim.personalTxId) {
        await tx.transaction.delete({ where: { id: claim.personalTxId } });
      }
    });
    return { ok: true };
  }
}
