import { Injectable, Logger } from '@nestjs/common';

export type GoldKaratCode = 18 | 21 | 24;

export type GoldQuotes = {
  unit: string;
  prices: { karat: GoldKaratCode; egpPerGram: number }[];
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
};

export type GoldHistoryPoint = {
  at: string;
  egpPerGram: number;
};

export type GoldHistory = {
  karat: GoldKaratCode;
  unit: string;
  series: GoldHistoryPoint[];
  updatedAt: string | null;
  stale: boolean;
  error: string | null;
};

type CacheEntry = {
  prices: { karat: GoldKaratCode; egpPerGram: number }[];
  updatedAt: string;
  fetchedAt: number;
};

type HistoryCacheEntry = {
  series: GoldHistoryPoint[];
  updatedAt: string;
  fetchedAt: number;
};

const CACHE_MS = 20 * 60 * 1000;
const HISTORY_CACHE_MS = 5 * 60 * 1000;
const NAHARDA_URL = 'https://api.naharda.com/v1/gold';
const NAHARDA_HISTORY_URL = 'https://api.naharda.com/v1/gold/history';
/** Max samples Naharda returns (~15 min cadence). */
const HISTORY_LIMIT = 500;

@Injectable()
export class GoldPriceService {
  private readonly log = new Logger(GoldPriceService.name);
  private cache: CacheEntry | null = null;
  private historyCache = new Map<GoldKaratCode, HistoryCacheEntry>();

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

  async getHistory(karat: GoldKaratCode): Promise<GoldHistory> {
    const now = Date.now();
    const cached = this.historyCache.get(karat);
    if (cached && now - cached.fetchedAt < HISTORY_CACHE_MS) {
      return {
        karat,
        unit: 'EGP per gram',
        series: cached.series,
        updatedAt: cached.updatedAt,
        stale: false,
        error: null,
      };
    }

    try {
      const url = `${NAHARDA_HISTORY_URL}?karat=${karat}&limit=${HISTORY_LIMIT}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        throw new Error(`Naharda history HTTP ${res.status}`);
      }
      const body = (await res.json()) as {
        data?: {
          karat?: number;
          history?: {
            karat?: number;
            value_egp?: number;
            fetched_at?: string;
          }[];
        };
        meta?: { cached_at?: string };
      };
      const raw = body.data?.history ?? [];
      const series = raw
        .map((row) => {
          const at = row.fetched_at;
          const egpPerGram = Number(row.value_egp);
          if (!at || !Number.isFinite(egpPerGram)) return null;
          return {
            at,
            egpPerGram: Math.round(egpPerGram * 100) / 100,
          };
        })
        .filter((p): p is GoldHistoryPoint => !!p)
        // Naharda returns newest-first; chart wants oldest → newest.
        .sort((a, b) => a.at.localeCompare(b.at));

      if (!series.length) {
        throw new Error('No gold history in response');
      }

      const updatedAt =
        body.meta?.cached_at ??
        series[series.length - 1]?.at ??
        new Date().toISOString();
      this.historyCache.set(karat, { series, updatedAt, fetchedAt: now });
      return {
        karat,
        unit: 'EGP per gram',
        series,
        updatedAt,
        stale: false,
        error: null,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'History fetch failed';
      this.log.warn(`Gold history fetch failed: ${message}`);
      if (cached) {
        return {
          karat,
          unit: 'EGP per gram',
          series: cached.series,
          updatedAt: cached.updatedAt,
          stale: true,
          error: message,
        };
      }
      return {
        karat,
        unit: 'EGP per gram',
        series: [],
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
