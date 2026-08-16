import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyUtc, isoFromDbDate, monthRangeLocal } from '../common/calendar';

type MoneyEvent = {
  id: string;
  kind: string;
  occurredOn: string;
  amount: number;
  note: string;
  status?: string;
  remaining?: number;
  categoryName?: string;
  parentId?: string;
  direction: string;
  fromName?: string;
  toName?: string;
};

@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    if (from && to) {
      return { from: dateOnlyUtc(from), to: dateOnlyUtc(to) };
    }
    const m = monthRangeLocal();
    return { from: dateOnlyUtc(m.from), to: dateOnlyUtc(m.to) };
  }

  private inRange(d: Date, from: Date, to: Date) {
    const key = isoFromDbDate(d);
    const a = isoFromDbDate(from);
    const b = isoFromDbDate(to);
    return key >= a && key <= b;
  }

  private claimStatus(remaining: number, original: number) {
    if (remaining <= 0.001) return 'REIMBURSED';
    if (remaining < original) return 'PARTIAL';
    return 'OPEN';
  }

  private coverStatus(remaining: number, original: number) {
    if (remaining <= 0.001) return 'SETTLED';
    if (remaining < original) return 'PARTIAL';
    return 'OPEN';
  }

  private remainingOf(
    amount: Prisma.Decimal,
    parts: { amount: Prisma.Decimal }[],
  ) {
    const paid = parts.reduce((s, r) => s + Number(r.amount), 0);
    return Math.max(0, Number(amount) - paid);
  }

  async withMember(householdId: string, memberId: string, from?: string, to?: string) {
    if (!memberId) throw new BadRequestException('Pick a person');
    const member = await this.prisma.membership.findUnique({
      where: { userId_householdId: { userId: memberId, householdId } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!member) throw new NotFoundException('That person is not in this house');

    const { from: fromDate, to: toDate } = this.range(from, to);
    const [claims, covers] = await Promise.all([
      this.prisma.houseClaim.findMany({
        where: { householdId, memberId },
        include: {
          category: { select: { name: true } },
          reimbursements: { orderBy: { occurredOn: 'asc' } },
        },
        orderBy: { occurredOn: 'desc' },
      }),
      this.prisma.houseCover.findMany({
        where: { householdId, memberId },
        include: {
          category: { select: { name: true } },
          repayments: { orderBy: { occurredOn: 'asc' } },
        },
        orderBy: { occurredOn: 'desc' },
      }),
    ]);

    let houseOwesMember = 0;
    let memberOwesHouse = 0;
    const events: MoneyEvent[] = [];

    for (const claim of claims) {
      const remaining = this.remainingOf(claim.amount, claim.reimbursements);
      houseOwesMember += remaining;
      if (this.inRange(claim.occurredOn, fromDate, toDate)) {
        events.push({
          id: `claim:${claim.id}`,
          kind: 'CLAIM',
          occurredOn: isoFromDbDate(claim.occurredOn),
          amount: Number(claim.amount),
          note: claim.note,
          status: this.claimStatus(remaining, Number(claim.amount)),
          remaining,
          categoryName: claim.category.name,
          direction: 'MEMBER_PAID_FOR_HOUSE',
        });
      }
      for (const r of claim.reimbursements) {
        if (!this.inRange(r.occurredOn, fromDate, toDate)) continue;
        events.push({
          id: `claim-pay:${r.id}`,
          kind: 'CLAIM_PAYBACK',
          occurredOn: isoFromDbDate(r.occurredOn),
          amount: Number(r.amount),
          note: '',
          parentId: claim.id,
          categoryName: claim.category.name,
          direction: 'HOUSE_PAID_MEMBER',
        });
      }
    }

    for (const cover of covers) {
      const remaining = this.remainingOf(cover.amount, cover.repayments);
      memberOwesHouse += remaining;
      if (this.inRange(cover.occurredOn, fromDate, toDate)) {
        events.push({
          id: `cover:${cover.id}`,
          kind: 'COVER',
          occurredOn: isoFromDbDate(cover.occurredOn),
          amount: Number(cover.amount),
          note: cover.note,
          status: this.coverStatus(remaining, Number(cover.amount)),
          remaining,
          categoryName: cover.category.name,
          direction: 'HOUSE_PAID_FOR_MEMBER',
        });
      }
      for (const r of cover.repayments) {
        if (!this.inRange(r.occurredOn, fromDate, toDate)) continue;
        events.push({
          id: `cover-pay:${r.id}`,
          kind: 'COVER_REPAY',
          occurredOn: isoFromDbDate(r.occurredOn),
          amount: Number(r.amount),
          note: '',
          parentId: cover.id,
          categoryName: cover.category.name,
          direction: 'MEMBER_PAID_HOUSE',
        });
      }
    }

    events.sort((a, b) => {
      if (a.occurredOn === b.occurredOn) return a.id < b.id ? 1 : -1;
      return a.occurredOn < b.occurredOn ? 1 : -1;
    });

    return {
      member: member.user,
      from: isoFromDbDate(fromDate),
      to: isoFromDbDate(toDate),
      status: {
        houseOwesMember: Math.round(houseOwesMember * 100) / 100,
        memberOwesHouse: Math.round(memberOwesHouse * 100) / 100,
      },
      events,
    };
  }

  async betweenMembers(
    householdId: string,
    viewerId: string,
    role: string,
    userA: string,
    userB: string,
    from?: string,
    to?: string,
  ) {
    if (!userA || !userB) throw new BadRequestException('Pick two people');
    if (userA === userB) {
      throw new BadRequestException('Pick two different people');
    }

    const isParty = viewerId === userA || viewerId === userB;
    if (role !== 'ADMIN' && !isParty) {
      throw new ForbiddenException('You can only open history that includes you');
    }

    const members = await this.prisma.membership.findMany({
      where: { householdId, userId: { in: [userA, userB] } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (members.length !== 2) {
      throw new NotFoundException('Both people must be in this house');
    }
    const a = members.find((m) => m.userId === userA)!.user;
    const b = members.find((m) => m.userId === userB)!.user;

    const { from: fromDate, to: toDate } = this.range(from, to);
    const loans = await this.prisma.peerLoan.findMany({
      where: {
        householdId,
        OR: [
          { fromUserId: userA, toUserId: userB },
          { fromUserId: userB, toUserId: userA },
        ],
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        category: { select: { name: true } },
        repayments: { orderBy: { occurredOn: 'asc' } },
      },
      orderBy: { occurredOn: 'desc' },
    });

    let aOwesB = 0;
    let bOwesA = 0;
    const events: MoneyEvent[] = [];

    for (const loan of loans) {
      const remaining = this.remainingOf(loan.originalAmount, loan.repayments);
      if (remaining > 0.001) {
        if (loan.toUserId === userA && loan.fromUserId === userB) aOwesB += remaining;
        if (loan.toUserId === userB && loan.fromUserId === userA) bOwesA += remaining;
      }

      if (this.inRange(loan.occurredOn, fromDate, toDate)) {
        events.push({
          id: `loan:${loan.id}`,
          kind: 'LOAN',
          occurredOn: isoFromDbDate(loan.occurredOn),
          amount: Number(loan.originalAmount),
          note: loan.note,
          status: remaining <= 0.001 ? 'SETTLED' : loan.status,
          remaining,
          categoryName: loan.category.name,
          direction:
            loan.fromUserId === userA ? 'A_GAVE_B' : 'B_GAVE_A',
          fromName: loan.fromUser.name,
          toName: loan.toUser.name,
        });
      }

      for (const r of loan.repayments) {
        if (!this.inRange(r.occurredOn, fromDate, toDate)) continue;
        // Borrower (toUser) pays lender (fromUser)
        events.push({
          id: `loan-pay:${r.id}`,
          kind: 'LOAN_REPAY',
          occurredOn: isoFromDbDate(r.occurredOn),
          amount: Number(r.amount),
          note: r.note ?? '',
          parentId: loan.id,
          categoryName: loan.category.name,
          direction:
            loan.toUserId === userA ? 'A_REPAID_B' : 'B_REPAID_A',
          fromName: loan.toUser.name,
          toName: loan.fromUser.name,
        });
      }
    }

    events.sort((aEvt, bEvt) => {
      if (aEvt.occurredOn === bEvt.occurredOn) return aEvt.id < bEvt.id ? 1 : -1;
      return aEvt.occurredOn < bEvt.occurredOn ? 1 : -1;
    });

    return {
      a,
      b,
      from: isoFromDbDate(fromDate),
      to: isoFromDbDate(toDate),
      status: {
        aOwesB: Math.round(aOwesB * 100) / 100,
        bOwesA: Math.round(bOwesA * 100) / 100,
      },
      events,
    };
  }
}
