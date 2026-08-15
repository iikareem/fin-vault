import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { CreateRepaymentDto } from './dto/create-repayment.dto';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  private remaining(original: Prisma.Decimal, repayments: { amount: Prisma.Decimal }[]) {
    const paid = repayments.reduce((s, r) => s + Number(r.amount), 0);
    return Number(original) - paid;
  }

  private shape(loan: {
    id: string;
    householdId: string;
    fromUserId: string;
    toUserId: string;
    categoryId: string;
    originalAmount: Prisma.Decimal;
    note: string;
    occurredOn: Date;
    status: string;
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
      categoryId: loan.categoryId,
      note: loan.note,
      occurredOn: loan.occurredOn,
      status: remaining <= 0.001 ? 'SETTLED' : loan.status,
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
    const loan = await this.prisma.peerLoan.create({
      data: {
        householdId,
        fromUserId,
        toUserId,
        categoryId: dto.categoryId,
        originalAmount: new Prisma.Decimal(dto.amount),
        occurredOn: new Date(dto.occurredOn),
        note: dto.note ?? '',
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        repayments: true,
      },
    });
    return this.shape(loan);
  }

  async repay(
    householdId: string,
    userId: string,
    loanId: string,
    dto: CreateRepaymentDto,
  ) {
    const loan = await this.prisma.peerLoan.findFirst({
      where: { id: loanId, householdId },
      include: { repayments: true },
    });
    if (!loan) throw new NotFoundException();
    if (loan.fromUserId !== userId && loan.toUserId !== userId) {
      throw new ForbiddenException('This loan is not yours');
    }
    const remaining = this.remaining(loan.originalAmount, loan.repayments);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException('That is more than what is still owed');
    }
    await this.prisma.loanRepayment.create({
      data: {
        loanId,
        amount: new Prisma.Decimal(dto.amount),
        occurredOn: new Date(dto.occurredOn),
        note: dto.note ?? '',
        recordedByUserId: userId,
      },
    });
    const left = remaining - dto.amount;
    if (left <= 0.001) {
      await this.prisma.peerLoan.update({
        where: { id: loanId },
        data: { status: 'SETTLED' },
      });
    }
    const updated = await this.prisma.peerLoan.findUniqueOrThrow({
      where: { id: loanId },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
        repayments: true,
      },
    });
    return this.shape(updated);
  }
}
