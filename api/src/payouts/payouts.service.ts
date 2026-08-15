import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayoutDto } from './dto/create-payout.dto';

const GIVE_KINDS = {
  Allowance: { house: 'Allowance', personal: 'Allowance', color: '#0284c7' },
  'Family gift': {
    house: 'Family gift',
    personal: 'Family gift',
    color: '#db2777',
  },
} as const;

@Injectable()
export class PayoutsService {
  constructor(private prisma: PrismaService) {}

  async create(householdId: string, adminId: string, dto: CreatePayoutDto) {
    const member = await this.prisma.membership.findFirst({
      where: { householdId, userId: dto.toUserId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!member) throw new BadRequestException('That person is not in this house');

    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, householdId, archived: false },
    });
    if (!account) throw new BadRequestException('Unknown account');

    const personalMembership = await this.prisma.membership.findFirst({
      where: { userId: dto.toUserId, household: { kind: 'PERSONAL' } },
    });
    if (!personalMembership) {
      throw new BadRequestException('That person has no personal money book');
    }
    const personalId = personalMembership.householdId;
    const personalCash = await this.prisma.account.findFirst({
      where: {
        householdId: personalId,
        type: 'CASH',
        archived: false,
        name: { in: ['Current', 'Cash'] },
      },
    });
    if (!personalCash) {
      throw new BadRequestException('That person has no cash wallet');
    }

    const kind = GIVE_KINDS[dto.kind ?? 'Allowance'];
    if (!kind) throw new BadRequestException('Pick allowance');

    const houseCat = await this.ensureCategory(
      householdId,
      kind.house,
      'EXPENSE',
      kind.color,
    );
    const personalCat = await this.ensureCategory(
      personalId,
      kind.personal,
      'INCOME',
      kind.color,
    );

    const note = dto.note?.trim() ?? '';
    const houseNote = note
      ? `${member.user.name} · ${note}`
      : member.user.name;
    const personalNote = note || kind.personal;

    return this.prisma.$transaction(async (tx) => {
      const houseTx = await tx.transaction.create({
        data: {
          householdId,
          userId: adminId,
          accountId: account.id,
          categoryId: houseCat.id,
          type: 'EXPENSE',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: houseNote,
        },
      });
      const personalTx = await tx.transaction.create({
        data: {
          householdId: personalId,
          userId: dto.toUserId,
          accountId: personalCash.id,
          categoryId: personalCat.id,
          type: 'INCOME',
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: personalNote,
        },
      });
      return tx.housePayout.create({
        data: {
          householdId,
          toUserId: dto.toUserId,
          recordedByUserId: adminId,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note,
          houseTxId: houseTx.id,
          personalTxId: personalTx.id,
        },
        include: {
          toUser: { select: { id: true, name: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      });
    });
  }

  private async ensureCategory(
    householdId: string,
    name: string,
    kind: 'EXPENSE' | 'INCOME',
    color: string,
  ) {
    const existing = await this.prisma.category.findFirst({
      where: { householdId, name, kind },
    });
    if (existing) return existing;
    return this.prisma.category.create({
      data: { householdId, name, kind, color },
    });
  }
}
