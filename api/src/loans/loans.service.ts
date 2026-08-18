import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { CreateRepaymentDto } from './dto/create-repayment.dto';

@Injectable()
export class LoansService implements OnModuleInit {
  private readonly logger = new Logger(LoansService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const result = await this.backfillMissingPersonalTxs();
      if (result.loans > 0 || result.repayments > 0) {
        this.logger.log(
          `Backfilled personal cash for ${result.loans} loans and ${result.repayments} repayments`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Peer loan personal-cash backfill skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private isoDate(d: Date) {
    return d.toISOString().slice(0, 10);
  }

  /**
   * Existing peer loans (before cash ledger) had no personal txs.
   * Idempotent: only fills null fromPersonalTxId / toPersonalTxId.
   * Only CASH loans should ever carry personal txs; TRACK_ONLY loans never do.
   */
  async backfillMissingPersonalTxs() {
    const loans = await this.prisma.peerLoan.findMany({
      where: {
        kind: 'CASH',
        OR: [{ fromPersonalTxId: null }, { toPersonalTxId: null }],
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { occurredOn: 'asc' },
    });
    const repayments = await this.prisma.loanRepayment.findMany({
      where: {
        OR: [{ fromPersonalTxId: null }, { toPersonalTxId: null }],
      },
      include: {
        loan: {
          include: {
            fromUser: { select: { id: true, name: true } },
            toUser: { select: { id: true, name: true } },
            category: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { occurredOn: 'asc' },
    });

    let loanCount = 0;
    let repayCount = 0;

    for (const loan of loans) {
      await this.prisma.$transaction(async (tx) => {
        const note = loan.note.trim();
        const occurredOn = this.isoDate(loan.occurredOn);
        const amount = Number(loan.originalAmount);
        let fromPersonalTxId = loan.fromPersonalTxId;
        let toPersonalTxId = loan.toPersonalTxId;
        if (!fromPersonalTxId) {
          fromPersonalTxId = await this.recordPersonalExpense(
            tx,
            loan.fromUserId,
            amount,
            occurredOn,
            loan.category.name,
            loan.category.color,
            note
              ? `${loan.toUser.name} · ${note}`
              : `Lent to ${loan.toUser.name}`,
          );
        }
        if (!toPersonalTxId) {
          toPersonalTxId = await this.recordPersonalIncome(
            tx,
            loan.toUserId,
            amount,
            occurredOn,
            loan.category.name,
            loan.category.color,
            note
              ? `${loan.fromUser.name} · ${note}`
              : `Borrowed from ${loan.fromUser.name}`,
          );
        }
        if (
          fromPersonalTxId !== loan.fromPersonalTxId ||
          toPersonalTxId !== loan.toPersonalTxId
        ) {
          await tx.peerLoan.update({
            where: { id: loan.id },
            data: { fromPersonalTxId, toPersonalTxId },
          });
          loanCount += 1;
        }
      });
    }

    for (const row of repayments) {
      await this.prisma.$transaction(async (tx) => {
        const loan = row.loan;
        const note = row.note.trim();
        const occurredOn = this.isoDate(row.occurredOn);
        const amount = Number(row.amount);
        let fromPersonalTxId = row.fromPersonalTxId;
        let toPersonalTxId = row.toPersonalTxId;
        if (!fromPersonalTxId) {
          fromPersonalTxId = await this.recordPersonalExpense(
            tx,
            loan.toUserId,
            amount,
            occurredOn,
            loan.category.name,
            loan.category.color,
            note
              ? `${loan.fromUser.name} · ${note}`
              : `Repaid ${loan.fromUser.name}`,
          );
        }
        if (!toPersonalTxId) {
          toPersonalTxId = await this.recordPersonalIncome(
            tx,
            loan.fromUserId,
            amount,
            occurredOn,
            loan.category.name,
            loan.category.color,
            note
              ? `${loan.toUser.name} · ${note}`
              : `Repayment from ${loan.toUser.name}`,
          );
        }
        if (
          fromPersonalTxId !== row.fromPersonalTxId ||
          toPersonalTxId !== row.toPersonalTxId
        ) {
          await tx.loanRepayment.update({
            where: { id: row.id },
            data: { fromPersonalTxId, toPersonalTxId },
          });
          repayCount += 1;
        }
      });
    }

    return { loans: loanCount, repayments: repayCount };
  }

  private remaining(
    original: Prisma.Decimal,
    repayments: { amount: Prisma.Decimal }[],
  ) {
    const paid = repayments.reduce((s, r) => s + Number(r.amount), 0);
    return Number(original) - paid;
  }

  private shape(loan: {
    id: string;
    householdId: string;
    fromUserId: string;
    toUserId: string;
    recordedByUserId?: string | null;
    categoryId: string;
    originalAmount: Prisma.Decimal;
    note: string;
    occurredOn: Date;
    status: string;
    kind: string;
    createdAt: Date;
    repayments: { amount: Prisma.Decimal }[];
    fromUser?: { id: string; name: string };
    toUser?: { id: string; name: string };
    category?: { id: string; name: string; color: string };
  }) {
    const remaining = this.remaining(loan.originalAmount, loan.repayments);
    return {
      id: loan.id,
      householdId: loan.householdId,
      fromUserId: loan.fromUserId,
      toUserId: loan.toUserId,
      recordedByUserId: loan.recordedByUserId ?? null,
      categoryId: loan.categoryId,
      note: loan.note,
      occurredOn: loan.occurredOn,
      status: remaining <= 0.001 ? 'SETTLED' : loan.status,
      kind: loan.kind,
      createdAt: loan.createdAt,
      fromUser: loan.fromUser,
      toUser: loan.toUser,
      category: loan.category,
      repayments: loan.repayments,
      originalAmount: Number(loan.originalAmount),
      remaining: Math.max(0, remaining),
      repaid: Number(loan.originalAmount) - Math.max(0, remaining),
    };
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
        note,
      },
    });
    return created.id;
  }

  private async recordPersonalIncome(
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
      'INCOME',
      color,
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

  async list(householdId: string, userId: string) {
    const loans = await this.prisma.peerLoan.findMany({
      where: { householdId },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        repayments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const shaped = loans.map((l) => this.shape(l));
    return {
      youOwe: shaped.filter((l) => l.toUserId === userId),
      youAreOwed: shaped.filter((l) => l.fromUserId === userId),
    };
  }

  async create(householdId: string, me: string, dto: CreateLoanDto) {
    const otherId = dto.toUserId;
    if (otherId === me) {
      throw new BadRequestException('You cannot lend to yourself');
    }
    const theyGave = dto.direction === 'THEY_GAVE';
    const kind = dto.kind ?? 'TRACK_ONLY';
    const fromUserId = theyGave ? otherId : me;
    const toUserId = theyGave ? me : otherId;
    const [member, category] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_householdId: { userId: otherId, householdId },
        },
      }),
      this.prisma.category.findFirst({
        where: { id: dto.categoryId, householdId, kind: 'PEER' },
      }),
    ]);
    if (!member) throw new BadRequestException('That person is not in this house');
    if (!category) throw new BadRequestException('Pick a loan category');

    const fromUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: fromUserId },
      select: { name: true },
    });
    const toUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: toUserId },
      select: { name: true },
    });
    const note = (dto.note ?? '').trim();
    const lenderNote = note
      ? `${toUser.name} · ${note}`
      : `Lent to ${toUser.name}`;
    const borrowerNote = note
      ? `${fromUser.name} · ${note}`
      : `Borrowed from ${fromUser.name}`;
    const occurredOn = dto.occurredOn;

    return this.prisma.$transaction(async (tx) => {
      let fromPersonalTxId: string | null = null;
      let toPersonalTxId: string | null = null;
      if (kind === 'CASH') {
        fromPersonalTxId = await this.recordPersonalExpense(
          tx,
          fromUserId,
          dto.amount,
          occurredOn,
          category.name,
          category.color,
          lenderNote,
        );
        toPersonalTxId = await this.recordPersonalIncome(
          tx,
          toUserId,
          dto.amount,
          occurredOn,
          category.name,
          category.color,
          borrowerNote,
        );
      }
      const loan = await tx.peerLoan.create({
        data: {
          householdId,
          fromUserId,
          toUserId,
          recordedByUserId: me,
          categoryId: dto.categoryId,
          originalAmount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(occurredOn),
          note: dto.note ?? '',
          kind,
          fromPersonalTxId,
          toPersonalTxId,
        },
        include: {
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          repayments: true,
        },
      });
      return this.shape(loan);
    });
  }

  private canManage(
    loan: {
      recordedByUserId: string | null;
      fromUserId: string;
      toUserId: string;
    },
    userId: string,
  ) {
    if (loan.recordedByUserId) return loan.recordedByUserId === userId;
    return loan.fromUserId === userId || loan.toUserId === userId;
  }

  async update(
    householdId: string,
    userId: string,
    loanId: string,
    dto: {
      amount?: number;
      categoryId?: string;
      occurredOn?: string;
      note?: string;
    },
  ) {
    const loan = await this.prisma.peerLoan.findFirst({
      where: { id: loanId, householdId },
      include: {
        repayments: true,
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    });
    if (!loan) throw new NotFoundException();
    if (!this.canManage(loan, userId)) {
      throw new ForbiddenException('You can only edit loans you created');
    }
    if (loan.repayments.length > 0) {
      throw new BadRequestException('This loan already has repayments');
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.PeerLoanUpdateInput = {};
      let category = loan.category;
      if (dto.amount !== undefined) {
        data.originalAmount = new Prisma.Decimal(dto.amount);
      }
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.occurredOn) data.occurredOn = new Date(dto.occurredOn);
      if (dto.categoryId) {
        const next = await tx.category.findFirst({
          where: { id: dto.categoryId, householdId, kind: 'PEER' },
        });
        if (!next) throw new BadRequestException('Pick a loan category');
        data.category = { connect: { id: dto.categoryId } };
        category = next;
      }

      await tx.peerLoan.update({ where: { id: loanId }, data });

      const amount = dto.amount ?? Number(loan.originalAmount);
      const occurredOn = dto.occurredOn ?? loan.occurredOn.toISOString().slice(0, 10);
      const note = (dto.note !== undefined ? dto.note : loan.note).trim();
      const lenderNote = note
        ? `${loan.toUser.name} · ${note}`
        : `Lent to ${loan.toUser.name}`;
      const borrowerNote = note
        ? `${loan.fromUser.name} · ${note}`
        : `Borrowed from ${loan.fromUser.name}`;

      if (loan.fromPersonalTxId) {
        const books = await this.personalCash(tx, loan.fromUserId);
        const cat = books
          ? await this.ensurePersonalCategory(
              tx,
              books.householdId,
              category.name,
              'EXPENSE',
              category.color,
            )
          : null;
        await tx.transaction.update({
          where: { id: loan.fromPersonalTxId },
          data: {
            amount: new Prisma.Decimal(amount),
            occurredOn: new Date(occurredOn),
            note: lenderNote,
            ...(cat ? { categoryId: cat.id } : {}),
          },
        });
      }
      if (loan.toPersonalTxId) {
        const books = await this.personalCash(tx, loan.toUserId);
        const cat = books
          ? await this.ensurePersonalCategory(
              tx,
              books.householdId,
              category.name,
              'INCOME',
              category.color,
            )
          : null;
        await tx.transaction.update({
          where: { id: loan.toPersonalTxId },
          data: {
            amount: new Prisma.Decimal(amount),
            occurredOn: new Date(occurredOn),
            note: borrowerNote,
            ...(cat ? { categoryId: cat.id } : {}),
          },
        });
      }

      const updated = await tx.peerLoan.findUniqueOrThrow({
        where: { id: loanId },
        include: {
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          repayments: true,
        },
      });
      return this.shape(updated);
    });
  }

  async remove(householdId: string, userId: string, loanId: string) {
    const loan = await this.prisma.peerLoan.findFirst({
      where: { id: loanId, householdId },
      include: { repayments: true },
    });
    if (!loan) throw new NotFoundException();
    if (!this.canManage(loan, userId)) {
      throw new ForbiddenException('You can only delete loans you created');
    }
    if (loan.repayments.length > 0) {
      throw new BadRequestException('This loan already has repayments');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.peerLoan.delete({ where: { id: loanId } });
      if (loan.fromPersonalTxId) {
        await tx.transaction.delete({ where: { id: loan.fromPersonalTxId } });
      }
      if (loan.toPersonalTxId) {
        await tx.transaction.delete({ where: { id: loan.toPersonalTxId } });
      }
    });
    return { ok: true };
  }

  async repay(
    householdId: string,
    userId: string,
    loanId: string,
    dto: CreateRepaymentDto,
  ) {
    const loan = await this.prisma.peerLoan.findFirst({
      where: { id: loanId, householdId },
      include: {
        repayments: true,
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    });
    if (!loan) throw new NotFoundException();
    // Only the borrower (who still owes) can record a repayment.
    if (loan.toUserId !== userId) {
      throw new ForbiddenException('Only the person who owes can pay this back');
    }
    const remaining = this.remaining(loan.originalAmount, loan.repayments);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException('That is more than what is still owed');
    }

    const note = (dto.note ?? '').trim();
    const payerNote = note
      ? `${loan.fromUser.name} · ${note}`
      : `Repaid ${loan.fromUser.name}`;
    const receiverNote = note
      ? `${loan.toUser.name} · ${note}`
      : `Repayment from ${loan.toUser.name}`;

    return this.prisma.$transaction(async (tx) => {
      const fromPersonalTxId = await this.recordPersonalExpense(
        tx,
        loan.toUserId,
        dto.amount,
        dto.occurredOn,
        loan.category.name,
        loan.category.color,
        payerNote,
      );
      const toPersonalTxId = await this.recordPersonalIncome(
        tx,
        loan.fromUserId,
        dto.amount,
        dto.occurredOn,
        loan.category.name,
        loan.category.color,
        receiverNote,
      );
      await tx.loanRepayment.create({
        data: {
          loanId,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: dto.note ?? '',
          recordedByUserId: userId,
          fromPersonalTxId,
          toPersonalTxId,
        },
      });
      const left = remaining - dto.amount;
      if (left <= 0.001) {
        await tx.peerLoan.update({
          where: { id: loanId },
          data: { status: 'SETTLED' },
        });
      }
      const updated = await tx.peerLoan.findUniqueOrThrow({
        where: { id: loanId },
        include: {
          fromUser: { select: { id: true, name: true } },
          toUser: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, color: true } },
          repayments: true,
        },
      });
      return this.shape(updated);
    });
  }
}
