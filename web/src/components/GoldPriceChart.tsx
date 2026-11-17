"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/api";

export type GoldChartPoint = {
  at: string;
  egpPerGram: number;
};

export type GoldChartBuy = {
  id: string;
  karat: 18 | 21 | 24;
  grams: number;
  paidAmount: number | null;
  costPerGram: number | null;
  note: string;
  acquiredOn: string | null;
  at: string;
  vsLive: number | null;
  vsLivePct: number | null;
};

type Props = {
  series: GoldChartPoint[];
  buys: GoldChartBuy[];
  liveEgpPerGram: number | null;
  avgBuyCost: number | null;
  currency: string;
  locale: "ar" | "en";
  label: string;
  buyLabel: string;
  nowLabel: string;
  avgBuyLabel: string;
  emptyLabel: string;
};

const W = 320;
const H = 180;
const PAD = { top: 18, right: 14, bottom: 30, left: 44 };

function formatDay(iso: string, locale: "ar" | "en") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatTooltipTime(iso: string, locale: "ar" | "en") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function GoldPriceChart({
  series,
  buys,
  liveEgpPerGram,
  avgBuyCost,
  currency,
  locale,
  label,
  buyLabel,
  nowLabel,
  avgBuyLabel,
  emptyLabel,
}: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const layout = useMemo(() => {
    const nowMs = Date.now();
    const buyTimes = buys
      .map((b) => Date.parse(b.at))
      .filter((ms) => Number.isFinite(ms));
    const seriesTimes = series.map((p) => Date.parse(p.at));
    const earliestBuy = buyTimes.length ? Math.min(...buyTimes) : null;
    const earliestSeries = seriesTimes.length ? Math.min(...seriesTimes) : null;

    // Timeline: first purchase → now (falls back to market history if no buys).
    const t0 =
      earliestBuy != null
        ? Math.min(earliestBuy, earliestSeries ?? earliestBuy)
        : (earliestSeries ?? nowMs - 86_400_000);
    const t1 = nowMs;
    const span = Math.max(t1 - t0, 1);

    const buyCosts = buys
      .filter((b) => b.costPerGram != null)
      .map((b) => b.costPerGram as number);
    const marketValues = series.map((p) => p.egpPerGram);
    const refs = [
      ...marketValues,
      ...buyCosts,
      ...(avgBuyCost != null ? [avgBuyCost] : []),
      ...(liveEgpPerGram != null ? [liveEgpPerGram] : []),
    ];
    if (!refs.length) return null;

    const minRaw = Math.min(...refs);
    const maxRaw = Math.max(...refs);
    const pad = Math.max((maxRaw - minRaw) * 0.14, maxRaw * 0.004, 1);
    const yMin = minRaw - pad;
    const yMax = maxRaw + pad;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const xAt = (ms: number) =>
      PAD.left + ((Math.min(Math.max(ms, t0), t1) - t0) / span) * innerW;
    const yAt = (v: number) =>
      PAD.top + ((yMax - v) / (yMax - yMin || 1)) * innerH;

    const points = series
      .map((p, i) => {
        const ms = seriesTimes[i];
        if (!Number.isFinite(ms)) return null;
        return {
          x: xAt(ms),
          y: yAt(p.egpPerGram),
          ...p,
          ms,
        };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);

    // Append live tip so the curve ends at "now".
    if (liveEgpPerGram != null) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last.ms - t1) > 60_000) {
        points.push({
          at: new Date(t1).toISOString(),
          egpPerGram: liveEgpPerGram,
          x: xAt(t1),
          y: yAt(liveEgpPerGram),
          ms: t1,
        });
      } else {
        last.x = xAt(t1);
        last.y = yAt(liveEgpPerGram);
        last.egpPerGram = liveEgpPerGram;
        last.ms = t1;
      }
    }

    const line =
      points.length >= 2
        ? points
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
            )
            .join(" ")
        : "";
    const area =
      points.length >= 2
        ? `${line} L${points[points.length - 1].x.toFixed(2)} ${(PAD.top + innerH).toFixed(2)}` +
          ` L${points[0].x.toFixed(2)} ${(PAD.top + innerH).toFixed(2)} Z`
        : "";

    const liveAboveBuy =
      liveEgpPerGram != null && avgBuyCost != null
        ? liveEgpPerGram >= avgBuyCost
        : points.length >= 2
          ? points[points.length - 1].egpPerGram >= points[0].egpPerGram
          : true;
    const stroke = liveAboveBuy ? "#047857" : "#b91c1c";

    const nowX = xAt(t1);
    const nowY = liveEgpPerGram != null ? yAt(liveEgpPerGram) : null;

    const buyMarkers = buys.map((b, index) => {
      const ms = Date.parse(b.at);
      const x = Number.isFinite(ms) ? xAt(ms) : PAD.left;
      const y =
        b.costPerGram != null
          ? yAt(b.costPerGram)
          : nowY ?? PAD.top + innerH / 2;
      return {
        ...b,
        x,
        y,
        index: index + 1,
      };
    });

    const avgY = avgBuyCost != null ? yAt(avgBuyCost) : null;
    const yTicks = [0.18, 0.5, 0.82].map((t) => yMin + (yMax - yMin) * t);
    const step =
      points.length < 2
        ? 10
        : Math.max(Math.abs(points[1].x - points[0].x), 4);

    return {
      points,
      line,
      area,
      stroke,
      buyMarkers,
      avgY,
      yTicks,
      yAt,
      nowX,
      nowY,
      t0,
      t1,
      step,
      liveAboveBuy,
    };
  }, [series, buys, liveEgpPerGram, avgBuyCost]);

  if (!layout || (layout.points.length < 2 && !layout.buyMarkers.length)) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">{emptyLabel}</p>
    );
  }

  const active =
    activeIdx != null
      ? layout.points[activeIdx]
      : layout.points[layout.points.length - 1] ?? null;

  return (
    <figure aria-label={label} className="w-full" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        onMouseLeave={() => setActiveIdx(null)}
      >
        <defs>
          <linearGradient id="goldChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={layout.stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={layout.stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {layout.yTicks.map((v, i) => {
          const yy = layout.yAt(v);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yy}
                y2={yy}
                stroke="currentColor"
                className="text-[var(--surface-border)]"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text
                x={PAD.left - 6}
                y={yy + 3}
                textAnchor="end"
                className="fill-[var(--muted)]"
                fontSize="8"
              >
                {Math.round(v).toLocaleString(
                  locale === "ar" ? "ar-EG" : "en-US",
                )}
              </text>
            </g>
          );
        })}

        {layout.avgY != null ? (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={layout.avgY}
              y2={layout.avgY}
              stroke="#92400e"
              strokeWidth="1.25"
              strokeDasharray="5 4"
              opacity="0.8"
            />
            <text
              x={PAD.left + 2}
              y={layout.avgY - 4}
              fill="#92400e"
              fontSize="8"
              fontWeight="600"
            >
              {avgBuyLabel}
            </text>
          </g>
        ) : null}

        {layout.area ? <path d={layout.area} fill="url(#goldChartFill)" /> : null}
        {layout.line ? (
          <path
            d={layout.line}
            fill="none"
            stroke={layout.stroke}
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}

        {/* Buy → now guide: shows your entry level against today */}
        {layout.buyMarkers.map((b) =>
          b.costPerGram != null && layout.nowX > b.x ? (
            <line
              key={`guide-${b.id}`}
              x1={b.x}
              x2={layout.nowX}
              y1={b.y}
              y2={b.y}
              stroke="#b45309"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.35"
            />
          ) : null,
        )}

        {layout.buyMarkers.map((b) => (
          <g key={b.id}>
            <line
              x1={b.x}
              x2={b.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#b45309"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.4"
            />
            <circle
              cx={b.x}
              cy={b.y}
              r="7"
              fill="#fffbeb"
              stroke="#b45309"
              strokeWidth="2"
            />
            <text
              x={b.x}
              y={b.y + 3}
              textAnchor="middle"
              fill="#92400e"
              fontSize="8"
              fontWeight="700"
            >
              {b.index}
            </text>
            <title>
              {`${buyLabel} ${b.index}: ${b.grams}g · ${
                b.costPerGram != null
                  ? money(b.costPerGram, currency, locale)
                  : "—"
              } · ${b.acquiredOn ?? formatTooltipTime(b.at, locale)}`}
            </title>
          </g>
        ))}

        {layout.nowY != null ? (
          <g>
            <circle
              cx={layout.nowX}
              cy={layout.nowY}
              r="5.5"
              fill="#fff"
              stroke={layout.stroke}
              strokeWidth="2.5"
            />
            <text
              x={layout.nowX}
              y={PAD.top - 4}
              textAnchor="end"
              fill={layout.stroke}
              fontSize="8"
              fontWeight="700"
            >
              {nowLabel}
            </text>
          </g>
        ) : null}

        {active && layout.points.length ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke={layout.stroke}
              strokeWidth="1"
              opacity="0.3"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="3.5"
              fill="#fff"
              stroke={layout.stroke}
              strokeWidth="1.5"
            />
          </g>
        ) : null}

        <text
          x={PAD.left}
          y={H - 8}
          className="fill-[var(--muted)]"
          fontSize="8"
        >
          {formatDay(new Date(layout.t0).toISOString(), locale)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          className="fill-[var(--muted)]"
          fontSize="8"
        >
          {nowLabel}
        </text>

        {layout.points.map((p, i) => (
          <rect
            key={`${p.at}-${i}`}
            x={p.x - layout.step / 2}
            y={PAD.top}
            width={layout.step}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setActiveIdx(i)}
            onFocus={() => setActiveIdx(i)}
            onTouchStart={() => setActiveIdx(i)}
          />
        ))}
      </svg>

      {active ? (
        <figcaption className="mt-1 flex items-baseline justify-between gap-2 text-xs text-[var(--muted)]">
          <span>{formatTooltipTime(active.at, locale)}</span>
          <span className="font-semibold tabular-nums text-[var(--foreground)]">
            {money(active.egpPerGram, currency, locale)}
            <span className="ms-1 font-normal text-[var(--muted)]">/g</span>
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}
