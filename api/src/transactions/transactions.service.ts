import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HouseholdKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { actorForSpace } from '../households/house-actor';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async list(householdId: string, kind: HouseholdKind, day?: string) {
    const rows = await this.prisma.transaction.findMany({
      where: {
        householdId,
        ...(day ? { occurredOn: new Date(day) } : {}),
      },
      include: {
        account: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true, color: true, kind: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: day ? 200 : 80,
    });
    return rows.map((row) => actorForSpace(kind, row));
  }

  async create(
    householdId: string,
    kind: HouseholdKind,
    userId: string,
    dto: CreateTransactionDto,
  ) {
    const [account, category] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: dto.accountId, householdId },
      }),
      this.prisma.category.findFirst({
        where: { id: dto.categoryId, householdId },
      }),
    ]);
    if (!account) throw new BadRequestException('Unknown account');
    if (!category) throw new BadRequestException('Unknown category');
    if (dto.type === 'EXPENSE' && category.kind !== 'EXPENSE') {
      throw new BadRequestException('Pick an expense category');
    }
    if (dto.type === 'INCOME' && category.kind !== 'INCOME') {
      throw new BadRequestException('Pick an income category');
    }
    const created = await this.prisma.transaction.create({
      data: {
        householdId,
        userId,
        accountId: dto.accountId,
        categoryId: dto.categoryId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        occurredOn: new Date(dto.occurredOn),
        note: dto.note ?? '',
      },
      include: {
        account: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true, color: true, kind: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return actorForSpace(kind, created);
  }

  async update(
    householdId: string,
    kind: HouseholdKind,
    id: string,
    dto: UpdateTransactionDto,
  ) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, householdId },
      include: {
        payoutHouse: true,
        payoutPersonal: true,
        charityGift: true,
        charityHouseGift: true,
        claimPersonal: true,
      },
    });
    if (!tx) throw new NotFoundException();
    if (tx.type === 'REIMBURSEMENT') {
      throw new BadRequestException('Edit the payback from the home list');
    }

    const data: Prisma.TransactionUpdateInput = {};
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.occurredOn) data.occurredOn = new Date(dto.occurredOn);
    if (dto.accountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: dto.accountId, householdId },
      });
      if (!account) throw new BadRequestException('Unknown account');
      data.account = { connect: { id: dto.accountId } };
    }
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, householdId },
      });
      if (!category) throw new BadRequestException('Unknown category');
      data.category = { connect: { id: dto.categoryId } };
    }

    await this.prisma.$transaction(async (db) => {
      await db.transaction.update({ where: { id }, data });
      if (dto.amount !== undefined) {
        if (tx.payoutHouse) {
          await db.transaction.update({
            where: { id: tx.payoutHouse.personalTxId },
            data: { amount: new Prisma.Decimal(dto.amount) },
          });
          await db.housePayout.update({
            where: { id: tx.payoutHouse.id },
            data: { amount: new Prisma.Decimal(dto.amount) },
          });
        }
        if (tx.charityGift) {
          await db.charityGift.update({
            where: { id: tx.charityGift.id },
            data: { amount: new Prisma.Decimal(dto.amount) },
          });
        }
        if (tx.charityHouseGift) {
          await db.charityGift.update({
            where: { id: tx.charityHouseGift.id },
            data: { amount: new Prisma.Decimal(dto.amount) },
          });
        }
        if (tx.claimPersonal && tx.claimPersonal.status === 'OPEN') {
          await db.houseClaim.update({
            where: { id: tx.claimPersonal.id },
            data: { amount: new Prisma.Decimal(dto.amount) },
          });
        }
      }
      if (dto.occurredOn) {
        const on = new Date(dto.occurredOn);
        if (tx.payoutHouse) {
          await db.transaction.update({
            where: { id: tx.payoutHouse.personalTxId },
            data: { occurredOn: on },
          });
          await db.housePayout.update({
            where: { id: tx.payoutHouse.id },
            data: { occurredOn: on },
          });
        }
        if (tx.charityGift) {
          await db.charityGift.update({
            where: { id: tx.charityGift.id },
            data: { occurredOn: on },
          });
        }
        if (tx.charityHouseGift) {
          await db.charityGift.update({
            where: { id: tx.charityHouseGift.id },
            data: { occurredOn: on },
          });
        }
        if (tx.claimPersonal && tx.claimPersonal.status === 'OPEN') {
          await db.houseClaim.update({
            where: { id: tx.claimPersonal.id },
            data: { occurredOn: on },
          });
        }
      }
    });

    const updated = await this.prisma.transaction.findFirstOrThrow({
      where: { id },
      include: {
        account: { select: { id: true, name: true, type: true } },
        category: { select: { id: true, name: true, color: true, kind: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return actorForSpace(kind, updated);
  }

  async remove(householdId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, householdId },
      include: {
        payoutHouse: true,
        payoutPersonal: true,
        charityGift: true,
        charityHouseGift: true,
        claimPersonal: true,
        reimbursement: true,
      },
    });
    if (!tx) throw new NotFoundException();
    if (tx.reimbursement) {
      throw new BadRequestException('This payback is tied to a pocket payment');
    }

    await this.prisma.$transaction(async (db) => {
      if (tx.payoutHouse) {
        await db.housePayout.delete({ where: { id: tx.payoutHouse.id } });
        await db.transaction.delete({ where: { id: tx.payoutHouse.personalTxId } });
      }
      if (tx.payoutPersonal) {
        await db.housePayout.delete({ where: { id: tx.payoutPersonal.id } });
        await db.transaction.delete({
          where: { id: tx.payoutPersonal.houseTxId },
        });
      }
      if (tx.charityGift) {
        await db.charityGift.delete({ where: { id: tx.charityGift.id } });
      }
      if (tx.charityHouseGift) {
        await db.charityGift.delete({ where: { id: tx.charityHouseGift.id } });
      }
      if (tx.claimPersonal) {
        if (tx.claimPersonal.status !== 'OPEN') {
          throw new BadRequestException('This was already paid back');
        }
        await db.houseClaim.delete({ where: { id: tx.claimPersonal.id } });
      }
      await db.transaction.delete({ where: { id } });
    });
    return { ok: true };
  }
}
