import { Injectable, Logger } from '@nestjs/common';

export type GoldKaratCode = 18 | 21 | 24;

export type GoldQuotes = {
  unit: string;
  prices: { karat: GoldKaratCode; egpPerGram: number }[];
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
};

type CacheEntry = {
  prices: { karat: GoldKaratCode; egpPerGram: number }[];
  updatedAt: string;
  fetchedAt: number;
};

const CACHE_MS = 20 * 60 * 1000;
const NAHARDA_URL = 'https://api.naharda.com/v1/gold';

@Injectable()
export class GoldPriceService {
  private readonly log = new Logger(GoldPriceService.name);
  private cache: CacheEntry | null = null;

  async getQuotes(): Promise<GoldQuotes> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_MS) {
      return {
        unit: 'EGP per gram',
        prices: this.cache.prices,
        updatedAt: this.cache.updatedAt,
        stale: false,
        error: null,
      };
    }

    try {
      const res = await fetch(NAHARDA_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new Error(`Naharda HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        data?: {
          unit?: string;
          world_derived?: { karat: number; value_egp: number }[];
          egypt_retail?: { karat: number; value_egp: number }[];
        };
        meta?: { cached_at?: string };
      };
      const rows =
        body.data?.egypt_retail?.length
          ? body.data.egypt_retail
          : (body.data?.world_derived ?? []);
      const prices = ([18, 21, 24] as GoldKaratCode[])
        .map((karat) => {
          const row = rows.find((r) => Number(r.karat) === karat);
          return row
            ? { karat, egpPerGram: Number(row.value_egp) }
            : null;
        })
        .filter((p): p is { karat: GoldKaratCode; egpPerGram: number } => !!p);

      if (!prices.length) {
        throw new Error('No gold prices in response');
      }

      const updatedAt = body.meta?.cached_at ?? new Date().toISOString();
      this.cache = { prices, updatedAt, fetchedAt: now };
      return {
        unit: body.data?.unit ?? 'EGP per gram',
        prices,
        updatedAt,
        stale: false,
        error: null,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Price fetch failed';
      this.log.warn(`Gold price fetch failed: ${message}`);
      if (this.cache) {
        return {
          unit: 'EGP per gram',
          prices: this.cache.prices,
          updatedAt: this.cache.updatedAt,
          stale: true,
          error: message,
        };
      }
      return {
        unit: 'EGP per gram',
        prices: [],
        updatedAt: null,
        stale: true,
        error: message,
      };
    }
  }

  priceFor(
    quotes: GoldQuotes,
    karat: GoldKaratCode,
  ): number | null {
    const row = quotes.prices.find((p) => p.karat === karat);
    return row ? row.egpPerGram : null;
  }
}
