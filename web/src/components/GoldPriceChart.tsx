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
  matchesChartKarat: boolean;
  inRange: boolean;
};

type Props = {
  series: GoldChartPoint[];
  buys: GoldChartBuy[];
  avgBuyCost: number | null;
  currency: string;
  locale: "ar" | "en";
  label: string;
  buyLabel: string;
  avgBuyLabel: string;
  emptyLabel: string;
};

const W = 320;
const H = 168;
const PAD = { top: 16, right: 12, bottom: 28, left: 44 };

function formatAxisTime(iso: string, locale: "ar" | "en", rangeSpanMs: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const shortDay = rangeSpanMs > 36 * 60 * 60 * 1000;
  return d.toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", {
    day: shortDay ? "numeric" : undefined,
    month: shortDay ? "short" : undefined,
    hour: shortDay ? undefined : "2-digit",
    minute: shortDay ? undefined : "2-digit",
    hour12: false,
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
  avgBuyCost,
  currency,
  locale,
  label,
  buyLabel,
  avgBuyLabel,
  emptyLabel,
}: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (series.length < 2) return null;

    const values = series.map((p) => p.egpPerGram);
    const buyCosts = buys
      .filter((b) => b.costPerGram != null)
      .map((b) => b.costPerGram as number);
    const refs = [
      ...values,
      ...buyCosts,
      ...(avgBuyCost != null ? [avgBuyCost] : []),
    ];
    const minRaw = Math.min(...refs);
    const maxRaw = Math.max(...refs);
    const pad = Math.max((maxRaw - minRaw) * 0.12, maxRaw * 0.004, 1);
    const yMin = minRaw - pad;
    const yMax = maxRaw + pad;
    const times = series.map((p) => Date.parse(p.at));
    const t0 = times[0];
    const t1 = times[times.length - 1];
    const span = Math.max(t1 - t0, 1);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const xAt = (ms: number) => PAD.left + ((ms - t0) / span) * innerW;
    const yAt = (v: number) =>
      PAD.top + ((yMax - v) / (yMax - yMin || 1)) * innerH;

    const points = series.map((p, i) => ({
      x: xAt(times[i]),
      y: yAt(p.egpPerGram),
      ...p,
      ms: times[i],
    }));

    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
    const area =
      `${line} L${points[points.length - 1].x.toFixed(2)} ${(PAD.top + innerH).toFixed(2)}` +
      ` L${points[0].x.toFixed(2)} ${(PAD.top + innerH).toFixed(2)} Z`;

    const up = values[values.length - 1] >= values[0];
    const stroke = up ? "#047857" : "#b91c1c";

    // Include older buys too: clamp to the left edge so cost levels stay visible
    // even when purchase dates fall before the available history window.
    const buyMarkers = buys
      .filter((b) => b.costPerGram != null || b.inRange)
      .map((b) => {
        const ms = Date.parse(b.at);
        let x: number;
        let beforeWindow = false;
        if (!Number.isFinite(ms) || ms < t0) {
          x = PAD.left;
          beforeWindow = true;
        } else if (ms > t1) {
          x = PAD.left + innerW;
        } else {
          x = xAt(ms);
        }
        return {
          ...b,
          x,
          y: b.costPerGram != null ? yAt(b.costPerGram) : yAt(values[0]),
          beforeWindow,
        };
      });

    const avgY = avgBuyCost != null ? yAt(avgBuyCost) : null;
    const yTicks = [0.2, 0.5, 0.8].map((t) => yMin + (yMax - yMin) * t);
    const step =
      points.length < 2
        ? 8
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
      span,
      step,
      up,
    };
  }, [series, buys, avgBuyCost]);

  if (!layout) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">{emptyLabel}</p>
    );
  }

  const active =
    activeIdx != null
      ? layout.points[activeIdx]
      : layout.points[layout.points.length - 1];

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
              opacity="0.85"
            />
            <text
              x={W - PAD.right}
              y={layout.avgY - 4}
              textAnchor="end"
              fill="#92400e"
              fontSize="8"
              fontWeight="600"
            >
              {avgBuyLabel}
            </text>
          </g>
        ) : null}

        <path d={layout.area} fill="url(#goldChartFill)" />
        <path
          d={layout.line}
          fill="none"
          stroke={layout.stroke}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {layout.buyMarkers.map((b) => (
          <g key={b.id} opacity={b.beforeWindow ? 0.85 : 1}>
            {!b.beforeWindow ? (
              <line
                x1={b.x}
                x2={b.x}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="#b45309"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.45"
              />
            ) : null}
            <circle
              cx={b.x}
              cy={b.y}
              r="5.5"
              fill="#fffbeb"
              stroke="#b45309"
              strokeWidth="2"
            />
            <circle cx={b.x} cy={b.y} r="2" fill="#b45309" />
            <title>
              {`${buyLabel}: ${b.grams}g · ${
                b.costPerGram != null
                  ? money(b.costPerGram, currency, locale)
                  : "—"
              } · ${b.acquiredOn ?? formatTooltipTime(b.at, locale)}`}
            </title>
          </g>
        ))}

        {active ? (
          <g>
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke={layout.stroke}
              strokeWidth="1"
              opacity="0.35"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="4.5"
              fill="#fff"
              stroke={layout.stroke}
              strokeWidth="2"
            />
          </g>
        ) : null}

        <text
          x={PAD.left}
          y={H - 8}
          className="fill-[var(--muted)]"
          fontSize="8"
        >
          {formatAxisTime(series[0].at, locale, layout.span)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          className="fill-[var(--muted)]"
          fontSize="8"
        >
          {formatAxisTime(series[series.length - 1].at, locale, layout.span)}
        </text>

        {layout.points.map((p, i) => (
          <rect
            key={p.at}
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
