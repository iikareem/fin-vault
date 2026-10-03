import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  dateOnlyUtc,
  isoFromDbDate,
  isoLocal,
} from '../common/calendar';
import { CreateTravelDto } from './dto/create-travel.dto';
import { UpdateTravelDto } from './dto/update-travel.dto';
import { AddTravelSpendDto } from './dto/add-travel-spend.dto';

type TravelStatus = 'upcoming' | 'active' | 'past';

@Injectable()
export class TravelsService {
  constructor(private prisma: PrismaService) {}

  private todayIso() {
    return isoLocal(new Date());
  }

  private status(
    startsOn: Date,
    endsOn: Date,
    endedAt: Date | null,
    today = this.todayIso(),
  ): TravelStatus {
    if (endedAt) return 'past';
    const start = isoFromDbDate(startsOn);
    const end = isoFromDbDate(endsOn);
    if (today < start) return 'upcoming';
    if (today > end) return 'past';
    return 'active';
  }

  private async spentTotal(travelId: string) {
    const agg = await this.prisma.transaction.aggregate({
      where: {
        travelId,
        type: { in: ['EXPENSE', 'TRACK'] },
      },
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  private shape(
    travel: {
      id: string;
      householdId: string;
      name: string;
      currency: string;
      softLimit: Prisma.Decimal | null;
      startsOn: Date;
      endsOn: Date;
      endedAt: Date | null;
      note: string;
      createdAt: Date;
      updatedAt: Date;
    },
    spent: number,
  ) {
    const softLimit =
      travel.softLimit == null ? null : Number(travel.softLimit);
    const status = this.status(
      travel.startsOn,
      travel.endsOn,
      travel.endedAt,
    );
    const pct =
      softLimit != null && softLimit > 0
        ? Math.round((spent / softLimit) * 1000) / 10
        : null;
    return {
      id: travel.id,
      householdId: travel.householdId,
      name: travel.name,
      currency: travel.currency,
      softLimit,
      startsOn: isoFromDbDate(travel.startsOn),
      endsOn: isoFromDbDate(travel.endsOn),
      endedAt: travel.endedAt ? travel.endedAt.toISOString() : null,
      note: travel.note,
      createdAt: travel.createdAt,
      updatedAt: travel.updatedAt,
      status,
      spent,
      remaining:
        softLimit != null ? Math.max(0, softLimit - spent) : null,
      pct,
      overLimit: softLimit != null ? spent > softLimit + 0.001 : false,
    };
  }

  private assertDateOrder(startsOn: string, endsOn: string) {
    if (startsOn > endsOn) {
      throw new BadRequestException('End date must be on or after start date');
    }
  }

  private async assertNoOverlap(
    householdId: string,
    startsOn: string,
    endsOn: string,
    excludeId?: string,
  ) {
    const start = dateOnlyUtc(startsOn);
    const end = dateOnlyUtc(endsOn);
    const clash = await this.prisma.travel.findFirst({
      where: {
        householdId,
        endedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startsOn: { lte: end },
        endsOn: { gte: start },
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new BadRequestException(
        'Only one travel at a time — dates overlap another trip',
      );
    }
  }

  private async currentWallet(householdId: string) {
    const current = await this.prisma.account.findFirst({
      where: {
        householdId,
        archived: false,
        type: 'CASH',
        name: 'Current',
      },
    });
    if (current) return current;
    const cash = await this.prisma.account.findFirst({
      where: {
        householdId,
        archived: false,
        type: 'CASH',
        name: 'Cash',
      },
    });
    if (!cash) throw new BadRequestException('No Current wallet');
    return cash;
  }

  async list(householdId: string) {
    const rows = await this.prisma.travel.findMany({
      where: { householdId },
      orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    });
    const shaped = await Promise.all(
      rows.map(async (row) => this.shape(row, await this.spentTotal(row.id))),
    );
    const active = shaped.find((t) => t.status === 'active') ?? null;
    const upcoming = shaped.filter((t) => t.status === 'upcoming');
    const past = shaped.filter((t) => t.status === 'past');
    return {
      active,
      upcoming,
      past,
      travels: shaped,
    };
  }

  async get(householdId: string, id: string) {
    const travel = await this.prisma.travel.findFirst({
      where: { id, householdId },
    });
    if (!travel) throw new NotFoundException();

    const spent = await this.spentTotal(id);
    const base = this.shape(travel, spent);

    const txs = await this.prisma.transaction.findMany({
      where: { travelId: id, type: { in: ['EXPENSE', 'TRACK'] } },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            color: true,
            emoji: true,
            parentId: true,
          },
        },
        account: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    });

    const byCategoryMap = new Map<
      string,
      {
        categoryId: string;
        name: string;
        nameAr: string;
        color: string;
        emoji: string;
        total: number;
      }
    >();
    const byDayMap = new Map<string, number>();
    let fromWallet = 0;
    let fromCash = 0;

    const items = txs.map((tx) => {
      const amount = Number(tx.amount);
      const day = isoFromDbDate(tx.occurredOn);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + amount);
      if (tx.type === 'EXPENSE') fromWallet += amount;
      else fromCash += amount;

      const cat = tx.category;
      const cur = byCategoryMap.get(cat.id) ?? {
        categoryId: cat.id,
        name: cat.name,
        nameAr: cat.nameAr,
        color: cat.color,
        emoji: cat.emoji,
        total: 0,
      };
      cur.total += amount;
      byCategoryMap.set(cat.id, cur);

      return {
        id: tx.id,
        amount,
        type: tx.type,
        paidFrom: tx.type === 'EXPENSE' ? ('CURRENT' as const) : ('CASH' as const),
        occurredOn: day,
        note: tx.note,
        category: cat,
        account: tx.account,
      };
    });

    const byDay = [...byDayMap.entries()]
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => b.day.localeCompare(a.day));

    const byCategory = [...byCategoryMap.values()].sort(
      (a, b) => b.total - a.total,
    );

    return {
      ...base,
      fromWallet,
      fromCash,
      byCategory,
      byDay,
      items,
    };
  }

  async create(householdId: string, dto: CreateTravelDto) {
    this.assertDateOrder(dto.startsOn, dto.endsOn);
    await this.assertNoOverlap(householdId, dto.startsOn, dto.endsOn);

    const created = await this.prisma.travel.create({
      data: {
        householdId,
        name: dto.name.trim(),
        currency: dto.currency,
        softLimit:
          dto.softLimit != null
            ? new Prisma.Decimal(dto.softLimit)
            : null,
        startsOn: dateOnlyUtc(dto.startsOn),
        endsOn: dateOnlyUtc(dto.endsOn),
        note: dto.note?.trim() ?? '',
      },
    });
    return this.shape(created, 0);
  }

  async update(householdId: string, id: string, dto: UpdateTravelDto) {
    const existing = await this.prisma.travel.findFirst({
      where: { id, householdId },
    });
    if (!existing) throw new NotFoundException();

    const startsOn = dto.startsOn ?? isoFromDbDate(existing.startsOn);
    const endsOn = dto.endsOn ?? isoFromDbDate(existing.endsOn);
    this.assertDateOrder(startsOn, endsOn);
    await this.assertNoOverlap(householdId, startsOn, endsOn, id);

    const updated = await this.prisma.travel.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.currency != null ? { currency: dto.currency } : {}),
        ...(dto.startsOn != null
          ? { startsOn: dateOnlyUtc(dto.startsOn) }
          : {}),
        ...(dto.endsOn != null ? { endsOn: dateOnlyUtc(dto.endsOn) } : {}),
        ...(dto.note != null ? { note: dto.note.trim() } : {}),
        ...(dto.softLimit !== undefined
          ? {
              softLimit:
                dto.softLimit == null
                  ? null
                  : new Prisma.Decimal(dto.softLimit),
            }
          : {}),
      },
    });
    return this.shape(updated, await this.spentTotal(id));
  }

  async end(householdId: string, id: string) {
    const existing = await this.prisma.travel.findFirst({
      where: { id, householdId },
    });
    if (!existing) throw new NotFoundException();
    if (existing.endedAt) {
      throw new BadRequestException('Trip is already ended');
    }
    const status = this.status(
      existing.startsOn,
      existing.endsOn,
      existing.endedAt,
    );
    if (status === 'past') {
      throw new BadRequestException('Trip is already ended');
    }

    const today = this.todayIso();
    const start = isoFromDbDate(existing.startsOn);
    // Keep history dates sensible: planned end becomes today (or start if upcoming).
    const endsOn = today < start ? start : today;

    const updated = await this.prisma.travel.update({
      where: { id },
      data: {
        endedAt: new Date(),
        endsOn: dateOnlyUtc(endsOn),
      },
    });
    return this.shape(updated, await this.spentTotal(id));
  }

  async remove(householdId: string, id: string) {
    const existing = await this.prisma.travel.findFirst({
      where: { id, householdId },
      include: { _count: { select: { txs: true } } },
    });
    if (!existing) throw new NotFoundException();
    if (existing._count.txs > 0) {
      throw new BadRequestException(
        'Remove trip spends first, or keep the trip in your past list',
      );
    }
    await this.prisma.travel.delete({ where: { id } });
    return { ok: true };
  }

  async addSpend(
    householdId: string,
    userId: string,
    travelId: string,
    dto: AddTravelSpendDto,
  ) {
    const travel = await this.prisma.travel.findFirst({
      where: { id: travelId, householdId },
    });
    if (!travel) throw new NotFoundException();

    const day = dto.occurredOn;
    const start = isoFromDbDate(travel.startsOn);
    const end = isoFromDbDate(travel.endsOn);
    if (day < start || day > end) {
      throw new BadRequestException('Spend date must fall inside the trip dates');
    }

    const category = await this.prisma.category.findFirst({
      where: {
        id: dto.categoryId,
        householdId,
        kind: 'EXPENSE',
      },
    });
    if (!category || category.hidden) {
      throw new BadRequestException('Pick an expense category');
    }

    const wallet = await this.currentWallet(householdId);
    // CURRENT = real wallet EXPENSE (balance goes down). CASH = TRACK (log only).
    const type = dto.paidFrom === 'CURRENT' ? 'EXPENSE' : 'TRACK';

    const created = await this.prisma.transaction.create({
      data: {
        householdId,
        userId,
        accountId: wallet.id,
        categoryId: category.id,
        travelId,
        type,
        amount: new Prisma.Decimal(dto.amount),
        occurredOn: dateOnlyUtc(day),
        note: dto.note?.trim() ?? '',
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            nameAr: true,
            color: true,
            emoji: true,
          },
        },
        account: { select: { id: true, name: true } },
      },
    });

    return {
      id: created.id,
      amount: Number(created.amount),
      type: created.type,
      paidFrom:
        created.type === 'EXPENSE'
          ? ('CURRENT' as const)
          : ('CASH' as const),
      occurredOn: isoFromDbDate(created.occurredOn),
      note: created.note,
      category: created.category,
      account: created.account,
      travel: this.shape(travel, await this.spentTotal(travelId)),
    };
  }
}
