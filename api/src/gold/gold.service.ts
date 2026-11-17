import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoldKarat, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoldHoldingDto } from './dto/create-gold-holding.dto';
import { UpdateGoldHoldingDto } from './dto/update-gold-holding.dto';
import {
  GoldHistoryRange,
  GoldKaratCode,
  GoldPriceService,
} from './gold-price.service';

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

const VALID_KARATS: GoldKaratCode[] = [18, 21, 24];
const VALID_RANGES: GoldHistoryRange[] = ['1d', '7d', '30d'];

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
        orderBy: [{ acquiredOn: 'desc' }, { createdAt: 'desc' }],
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

  async chart(
    householdId: string,
    karatRaw?: string | number,
    rangeRaw?: string,
  ) {
    const karat = this.parseKarat(karatRaw) ?? 21;
    const range = this.parseRange(rangeRaw) ?? '7d';

    const [holdings, quotes, history] = await Promise.all([
      this.prisma.goldHolding.findMany({
        where: { householdId },
        orderBy: [{ acquiredOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prices.getQuotes(),
      this.prices.getHistory(karat, range),
    ]);

    const series = history.series;
    const first = series[0]?.egpPerGram ?? null;
    const last = series[series.length - 1]?.egpPerGram ?? null;
    const changeAbs =
      first != null && last != null
        ? Math.round((last - first) * 100) / 100
        : null;
    const changePct =
      changeAbs != null && first != null && first > 0
        ? Math.round((changeAbs / first) * 10000) / 100
        : null;

    const seriesStartMs = series[0] ? Date.parse(series[0].at) : null;
    const seriesEndMs = series.length
      ? Date.parse(series[series.length - 1].at)
      : null;

    const buys = holdings
      .map((h) => {
        const holdingKarat = ENUM_TO_KARAT[h.karat];
        const grams = Number(h.grams);
        const paidAmount =
          h.paidAmount == null
            ? null
            : Math.round(Number(h.paidAmount) * 100) / 100;
        const costPerGram =
          paidAmount != null && grams > 0
            ? Math.round((paidAmount / grams) * 100) / 100
            : null;
        const acquiredOn = h.acquiredOn
          ? h.acquiredOn.toISOString().slice(0, 10)
          : null;
        const atIso = acquiredOn
          ? `${acquiredOn}T12:00:00.000Z`
          : h.createdAt.toISOString();
        const atMs = Date.parse(atIso);
        const inRange =
          seriesStartMs != null &&
          seriesEndMs != null &&
          Number.isFinite(atMs) &&
          atMs >= seriesStartMs - 12 * 60 * 60 * 1000 &&
          atMs <= seriesEndMs + 12 * 60 * 60 * 1000;
        return {
          id: h.id,
          karat: holdingKarat,
          grams,
          paidAmount,
          costPerGram,
          note: h.note,
          acquiredOn,
          at: atIso,
          /** Highlight buys for the karat currently charted. */
          matchesChartKarat: holdingKarat === karat,
          inRange,
        };
      })
      .filter((b) => b.matchesChartKarat);

    const avgBuyCost = (() => {
      const withCost = buys.filter((b) => b.costPerGram != null && b.grams > 0);
      if (!withCost.length) return null;
      const totalGrams = withCost.reduce((s, b) => s + b.grams, 0);
      const weighted = withCost.reduce(
        (s, b) => s + (b.costPerGram as number) * b.grams,
        0,
      );
      return totalGrams > 0
        ? Math.round((weighted / totalGrams) * 100) / 100
        : null;
    })();

    let totalValue = 0;
    let totalGrams = 0;
    const byKaratMap = new Map<
      GoldKaratCode,
      { grams: number; value: number; paid: number; pieces: number }
    >();
    for (const k of VALID_KARATS) {
      byKaratMap.set(k, { grams: 0, value: 0, paid: 0, pieces: 0 });
    }

    const byHolding = holdings.map((h) => {
      const holdingKarat = ENUM_TO_KARAT[h.karat];
      const grams = Number(h.grams);
      const paidAmount =
        h.paidAmount == null
          ? null
          : Math.round(Number(h.paidAmount) * 100) / 100;
      const egpPerGram = this.prices.priceFor(quotes, holdingKarat);
      const value =
        egpPerGram == null ? null : Math.round(grams * egpPerGram * 100) / 100;
      if (value != null) totalValue += value;
      totalGrams += grams;
      const bucket = byKaratMap.get(holdingKarat)!;
      bucket.grams += grams;
      bucket.pieces += 1;
      if (value != null) bucket.value += value;
      if (paidAmount != null) bucket.paid += paidAmount;
      return {
        id: h.id,
        karat: holdingKarat,
        grams,
        paidAmount,
        value,
        note: h.note,
        acquiredOn: h.acquiredOn
          ? h.acquiredOn.toISOString().slice(0, 10)
          : null,
      };
    });

    const roundedTotalValue = Math.round(totalValue * 100) / 100;
    const byKarat = VALID_KARATS.map((k) => {
      const row = byKaratMap.get(k)!;
      return {
        karat: k,
        grams: Math.round(row.grams * 1000) / 1000,
        value: Math.round(row.value * 100) / 100,
        paid: row.paid > 0 ? Math.round(row.paid * 100) / 100 : null,
        pieces: row.pieces,
        pctGrams:
          totalGrams > 0
            ? Math.round((row.grams / totalGrams) * 1000) / 10
            : 0,
        pctValue:
          roundedTotalValue > 0
            ? Math.round((row.value / roundedTotalValue) * 1000) / 10
            : 0,
      };
    }).filter((r) => r.pieces > 0 || r.grams > 0);

    const distributionHoldings = byHolding
      .map((h) => ({
        ...h,
        pctValue:
          h.value != null && roundedTotalValue > 0
            ? Math.round((h.value / roundedTotalValue) * 1000) / 10
            : 0,
        pctGrams:
          totalGrams > 0
            ? Math.round((h.grams / totalGrams) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    return {
      karat,
      range,
      unit: history.unit,
      series,
      change: {
        absolute: changeAbs,
        pct: changePct,
      },
      liveEgpPerGram: this.prices.priceFor(quotes, karat),
      avgBuyCost,
      buys,
      distribution: {
        totalGrams: Math.round(totalGrams * 1000) / 1000,
        totalValue: roundedTotalValue,
        byKarat,
        byHolding: distributionHoldings,
      },
      quotes,
      updatedAt: history.updatedAt ?? quotes.updatedAt,
      stale: history.stale || quotes.stale,
      error: history.error ?? quotes.error,
    };
  }

  private parseKarat(raw?: string | number): GoldKaratCode | null {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return VALID_KARATS.includes(n as GoldKaratCode)
      ? (n as GoldKaratCode)
      : null;
  }

  private parseRange(raw?: string): GoldHistoryRange | null {
    return VALID_RANGES.includes(raw as GoldHistoryRange)
      ? (raw as GoldHistoryRange)
      : null;
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
