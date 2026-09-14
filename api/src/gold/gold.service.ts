import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoldKarat, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoldHoldingDto } from './dto/create-gold-holding.dto';
import { UpdateGoldHoldingDto } from './dto/update-gold-holding.dto';
import { GoldKaratCode, GoldPriceService } from './gold-price.service';

const KARAT_TO_ENUM: Record<GoldKaratCode, GoldKarat> = {
  18: 'K18',
  21: 'K21',
  24: 'K24',
};

const ENUM_TO_KARAT: Record<GoldKarat, GoldKaratCode> = {
  K18: 18,
  K21: 21,
  K24: 24,
};

@Injectable()
export class GoldService {
  constructor(
    private prisma: PrismaService,
    private prices: GoldPriceService,
  ) {}

  async summary(householdId: string) {
    const [holdings, quotes] = await Promise.all([
      this.prisma.goldHolding.findMany({
        where: { householdId },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prices.getQuotes(),
    ]);

    let totalValue = 0;
    let totalPaid = 0;
    let totalGainLossSum = 0;
    const rows = holdings.map((h) => {
      const karat = ENUM_TO_KARAT[h.karat];
      const grams = Number(h.grams);
      const paidAmount =
        h.paidAmount == null ? null : Math.round(Number(h.paidAmount) * 100) / 100;
      const egpPerGram = this.prices.priceFor(quotes, karat);
      const currentValue =
        egpPerGram == null ? null : Math.round(grams * egpPerGram * 100) / 100;
      if (currentValue != null) totalValue += currentValue;
      if (paidAmount != null) totalPaid += paidAmount;
      const gainLoss =
        currentValue != null && paidAmount != null
          ? Math.round((currentValue - paidAmount) * 100) / 100
          : null;
      if (gainLoss != null) totalGainLossSum += gainLoss;
      const gainLossPct =
        gainLoss != null && paidAmount != null && paidAmount > 0
          ? Math.round((gainLoss / paidAmount) * 10000) / 100
          : null;
      return {
        id: h.id,
        grams,
        karat,
        paidAmount,
        note: h.note,
        acquiredOn: h.acquiredOn
          ? h.acquiredOn.toISOString().slice(0, 10)
          : null,
        createdAt: h.createdAt.toISOString(),
        egpPerGram,
        currentValue,
        gainLoss,
        gainLossPct,
      };
    });

    const roundedTotalValue = Math.round(totalValue * 100) / 100;
    const roundedTotalPaid = Math.round(totalPaid * 100) / 100;
    const totalGainLoss =
      totalPaid > 0
        ? Math.round(totalGainLossSum * 100) / 100
        : null;
    const totalGainLossPct =
      totalGainLoss != null && roundedTotalPaid > 0
        ? Math.round((totalGainLoss / roundedTotalPaid) * 10000) / 100
        : null;

    return {
      quotes,
      holdings: rows,
      totalGrams: rows.reduce((s, r) => s + r.grams, 0),
      totalValue: roundedTotalValue,
      totalPaid: roundedTotalPaid > 0 ? roundedTotalPaid : null,
      totalGainLoss,
      totalGainLossPct,
    };
  }

  async create(householdId: string, userId: string, dto: CreateGoldHoldingDto) {
    const created = await this.prisma.goldHolding.create({
      data: {
        householdId,
        userId,
        grams: new Prisma.Decimal(dto.grams),
        karat: KARAT_TO_ENUM[dto.karat],
        paidAmount:
          dto.paidAmount != null
            ? new Prisma.Decimal(dto.paidAmount)
            : null,
        note: dto.note?.trim() ?? '',
        acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn) : null,
      },
    });
    return this.summary(householdId).then((s) => ({
      ...s,
      createdId: created.id,
    }));
  }

  async update(
    householdId: string,
    userId: string,
    id: string,
    dto: UpdateGoldHoldingDto,
  ) {
    const row = await this.prisma.goldHolding.findFirst({
      where: { id, householdId },
    });
    if (!row) throw new NotFoundException();
    if (row.userId !== userId) {
      throw new ForbiddenException('You can only edit your own gold');
    }

    await this.prisma.goldHolding.update({
      where: { id },
      data: {
        ...(dto.grams !== undefined
          ? { grams: new Prisma.Decimal(dto.grams) }
          : {}),
        ...(dto.karat !== undefined ? { karat: KARAT_TO_ENUM[dto.karat] } : {}),
        ...(dto.paidAmount !== undefined
          ? {
              paidAmount:
                dto.paidAmount === null
                  ? null
                  : new Prisma.Decimal(dto.paidAmount),
            }
          : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() } : {}),
        ...(dto.acquiredOn !== undefined
          ? {
              acquiredOn:
                dto.acquiredOn === null || dto.acquiredOn === ''
                  ? null
                  : new Date(dto.acquiredOn),
            }
          : {}),
      },
    });
    return this.summary(householdId);
  }

  async remove(householdId: string, userId: string, id: string) {
    const row = await this.prisma.goldHolding.findFirst({
      where: { id, householdId },
    });
    if (!row) throw new NotFoundException();
    if (row.userId !== userId) {
      throw new ForbiddenException('You can only delete your own gold');
    }
    await this.prisma.goldHolding.delete({ where: { id } });
    return this.summary(householdId);
  }
}
