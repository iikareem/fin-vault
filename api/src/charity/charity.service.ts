import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCharityTypeDto } from './dto/create-charity-type.dto';
import { UpdateCharityTypeDto } from './dto/update-charity-type.dto';
import { dateOnlyUtc, daysInMonth } from '../common/calendar';
import { CreateCharityGiftDto } from './dto/create-charity-gift.dto';
import { UpdateCharityGiftDto } from './dto/update-charity-gift.dto';

const MOSQUE = { name: 'Mosque', color: '#0f766e' };
const EXTRA_DEFAULTS = [
  { name: 'Zakat', color: '#b45309' },
  { name: 'Orphans', color: '#7c3aed' },
  { name: 'Sadaqah', color: '#15803d' },
];
const KNOWN_COLORS: Record<string, string> = {
  Mosque: '#0f766e',
  Zakat: '#b45309',
  Orphans: '#7c3aed',
  Sadaqah: '#15803d',
};

@Injectable()
export class CharityService {
  constructor(private prisma: PrismaService) {}

  private monthBounds(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestException('Use month as YYYY-MM');
    const y = Number(match[1]);
    const m = Number(match[2]);
    const last = daysInMonth(y, m);
    return {
      from: dateOnlyUtc(`${month}-01`),
      to: dateOnlyUtc(`${month}-${String(last).padStart(2, '0')}`),
    };
  }

  async ensureDefaults(householdId: string) {
    await this.prisma.charityType.upsert({
      where: {
        householdId_name: { householdId, name: MOSQUE.name },
      },
      create: { householdId, name: MOSQUE.name, color: MOSQUE.color },
      update: { archived: false },
    });

    for (const type of EXTRA_DEFAULTS) {
      const existing = await this.prisma.charityType.findUnique({
        where: { householdId_name: { householdId, name: type.name } },
      });
      if (!existing || existing.archived) continue;
      const used = await this.prisma.charityGift.count({
        where: { typeId: existing.id },
      });
      if (used === 0) {
        await this.prisma.charityType.update({
          where: { id: existing.id },
          data: { archived: true },
        });
      }
    }
  }

  async month(householdId: string, month: string) {
    await this.ensureDefaults(householdId);
    const { from, to } = this.monthBounds(month);
    const gifts = await this.prisma.charityGift.findMany({
      where: {
        householdId,
        occurredOn: { gte: from, lte: to },
      },
      include: { member: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const giftedIds = [...new Set(gifts.map((g) => g.typeId))];
    const types = await this.prisma.charityType.findMany({
      where: {
        householdId,
        OR: giftedIds.length
          ? [{ archived: false }, { id: { in: giftedIds } }]
          : [{ archived: false }],
      },
    });
    types.sort((a, b) => {
      if (a.name === 'Mosque') return -1;
      if (b.name === 'Mosque') return 1;
      return a.name.localeCompare(b.name);
    });

    const rows = types.map((type) => {
      const typeGifts = gifts.filter((g) => g.typeId === type.id);
      const total = typeGifts.reduce((s, g) => s + Number(g.amount), 0);
      const goal = Number(type.monthlyGoal);
      const byMemberMap = new Map<
        string,
        { userId: string; name: string; total: number }
      >();
      for (const g of typeGifts) {
        const fromHouse = Boolean(g.houseTxId);
        const userId = fromHouse ? 'house' : g.member.id;
        const name = fromHouse ? 'House' : g.member.name;
        const cur = byMemberMap.get(userId) ?? {
          userId,
          name,
          total: 0,
        };
        cur.total += Number(g.amount);
        byMemberMap.set(userId, cur);
      }
      const paid = goal > 0 ? total + 0.001 >= goal : total > 0;
      return {
        id: type.id,
        name: type.name,
        color: type.color,
        monthlyGoal: goal,
        total,
        paid,
        byMember: [...byMemberMap.values()].sort((a, b) => b.total - a.total),
        gifts: typeGifts.map((g) => ({
          id: g.id,
          amount: Number(g.amount),
          occurredOn: g.occurredOn,
          note: g.note,
          fromHouse: Boolean(g.houseTxId),
          member: g.houseTxId
            ? { id: 'house', name: 'House' }
            : g.member,
        })),
      };
    });

    return {
      month,
      familyTotal: rows.reduce((s, r) => s + r.total, 0),
      types: rows,
    };
  }

  async createType(householdId: string, dto: CreateCharityTypeDto) {
    const name = dto.name.trim();
    const color = dto.color ?? KNOWN_COLORS[name] ?? '#0f766e';
    const existing = await this.prisma.charityType.findUnique({
      where: { householdId_name: { householdId, name } },
    });
    if (existing) {
      if (!existing.archived) {
        throw new BadRequestException('That charity type already exists');
      }
      return this.prisma.charityType.update({
        where: { id: existing.id },
        data: {
          archived: false,
          color,
          ...(dto.monthlyGoal !== undefined
            ? { monthlyGoal: new Prisma.Decimal(dto.monthlyGoal) }
            : {}),
        },
      });
    }
    return this.prisma.charityType.create({
      data: {
        householdId,
        name,
        color,
        monthlyGoal: new Prisma.Decimal(dto.monthlyGoal ?? 0),
      },
    });
  }

  async updateType(
    householdId: string,
    typeId: string,
    dto: UpdateCharityTypeDto,
  ) {
    const type = await this.prisma.charityType.findFirst({
      where: { id: typeId, householdId },
    });
    if (!type) throw new NotFoundException('Charity type not found');
    return this.prisma.charityType.update({
      where: { id: typeId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.color ? { color: dto.color } : {}),
        ...(dto.monthlyGoal !== undefined
          ? { monthlyGoal: new Prisma.Decimal(dto.monthlyGoal) }
          : {}),
      },
    });
  }

  async contribute(
    householdId: string,
    memberId: string,
    role: string,
    dto: CreateCharityGiftDto,
  ) {
    const type = await this.prisma.charityType.findFirst({
      where: { id: dto.typeId, householdId, archived: false },
    });
    if (!type) throw new NotFoundException('Charity type not found');
    const fromHouse = dto.fromHouse === true;
    if (fromHouse && role !== 'ADMIN') {
      throw new ForbiddenException('Only an admin can pay charity from house cash');
    }

    return this.prisma.$transaction(async (tx) => {
      let personalTxId: string | null = null;
      let houseTxId: string | null = null;
      if (fromHouse) {
        houseTxId = await this.recordOnHouse(
          tx,
          householdId,
          memberId,
          dto.amount,
          dto.occurredOn,
          type.name,
          dto.note ?? '',
          dto.accountId,
        );
      } else {
        personalTxId = await this.recordOnPersonal(
          tx,
          memberId,
          dto.amount,
          dto.occurredOn,
          type.name,
          dto.note ?? '',
        );
      }
      return tx.charityGift.create({
        data: {
          householdId,
          typeId: type.id,
          memberId,
          amount: new Prisma.Decimal(dto.amount),
          occurredOn: new Date(dto.occurredOn),
          note: dto.note ?? '',
          personalTxId,
          houseTxId,
        },
        include: { member: { select: { id: true, name: true } } },
      });
    });
  }

  async updateGift(
    householdId: string,
    userId: string,
    role: string,
    giftId: string,
    dto: UpdateCharityGiftDto,
  ) {
    const gift = await this.prisma.charityGift.findFirst({
      where: { id: giftId, householdId },
    });
    if (!gift) throw new NotFoundException();
    if (gift.memberId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only edit your own charity');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.charityGift.update({
        where: { id: giftId },
        data: {
          ...(dto.amount !== undefined
            ? { amount: new Prisma.Decimal(dto.amount) }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.occurredOn ? { occurredOn: new Date(dto.occurredOn) } : {}),
        },
      });
      if (gift.personalTxId) {
        await tx.transaction.update({
          where: { id: gift.personalTxId },
          data: {
            ...(dto.amount !== undefined
              ? { amount: new Prisma.Decimal(dto.amount) }
              : {}),
            ...(dto.note !== undefined ? { note: dto.note } : {}),
            ...(dto.occurredOn ? { occurredOn: new Date(dto.occurredOn) } : {}),
          },
        });
      }
      if (gift.houseTxId) {
        await tx.transaction.update({
          where: { id: gift.houseTxId },
          data: {
            ...(dto.amount !== undefined
              ? { amount: new Prisma.Decimal(dto.amount) }
              : {}),
            ...(dto.note !== undefined ? { note: dto.note } : {}),
            ...(dto.occurredOn ? { occurredOn: new Date(dto.occurredOn) } : {}),
          },
        });
      }
    });
    return this.prisma.charityGift.findFirstOrThrow({
      where: { id: giftId },
      include: { member: { select: { id: true, name: true } } },
    });
  }

  async removeGift(
    householdId: string,
    userId: string,
    role: string,
    giftId: string,
  ) {
    const gift = await this.prisma.charityGift.findFirst({
      where: { id: giftId, householdId },
    });
    if (!gift) throw new NotFoundException();
    if (gift.memberId !== userId && role !== 'ADMIN') {
      throw new ForbiddenException('You can only delete your own charity');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.charityGift.delete({ where: { id: giftId } });
      if (gift.personalTxId) {
        await tx.transaction.delete({ where: { id: gift.personalTxId } });
      }
      if (gift.houseTxId) {
        await tx.transaction.delete({ where: { id: gift.houseTxId } });
      }
    });
    return { ok: true };
  }

  private async recordOnPersonal(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    occurredOn: string,
    typeName: string,
    note: string,
  ) {
    const membership = await tx.membership.findFirst({
      where: { userId, household: { kind: 'PERSONAL' } },
    });
    if (!membership) return null;
    const householdId = membership.householdId;
    const cash = await tx.account.findFirst({
      where: {
        householdId,
        type: 'CASH',
        archived: false,
        name: { in: ['Current', 'Cash'] },
      },
    });
    if (!cash) return null;
    const category = await this.ensureCharityCategory(tx, householdId);
    const created = await tx.transaction.create({
      data: {
        householdId,
        accountId: cash.id,
        categoryId: category.id,
        userId,
        type: 'EXPENSE',
        amount: new Prisma.Decimal(amount),
        occurredOn: new Date(occurredOn),
        note: note || typeName,
      },
    });
    return created.id;
  }

  private async recordOnHouse(
    tx: Prisma.TransactionClient,
    householdId: string,
    userId: string,
    amount: number,
    occurredOn: string,
    typeName: string,
    note: string,
    accountId?: string,
  ) {
    const cash = accountId
      ? await tx.account.findFirst({
          where: {
            id: accountId,
            householdId,
            type: 'CASH',
            archived: false,
          },
        })
      : await tx.account.findFirst({
          where: {
            householdId,
            type: 'CASH',
            archived: false,
            name: { in: ['Current', 'Cash'] },
          },
        });
    if (!cash) throw new BadRequestException('Unknown house cash wallet');
    const category = await this.ensureCharityCategory(tx, householdId);
    const created = await tx.transaction.create({
      data: {
        householdId,
        accountId: cash.id,
        categoryId: category.id,
        userId,
        type: 'EXPENSE',
        amount: new Prisma.Decimal(amount),
        occurredOn: new Date(occurredOn),
        note: note || typeName,
      },
    });
    return created.id;
  }

  private async ensureCharityCategory(
    tx: Prisma.TransactionClient,
    householdId: string,
  ) {
    const existing = await tx.category.findFirst({
      where: { householdId, name: 'Charity', kind: 'EXPENSE' },
    });
    if (existing) return existing;
    return tx.category.create({
      data: {
        householdId,
        name: 'Charity',
        kind: 'EXPENSE',
        color: '#0f766e',
      },
    });
  }
}
