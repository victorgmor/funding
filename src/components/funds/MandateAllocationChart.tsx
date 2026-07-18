import { useMemo, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import type { Fund, Mandate } from "@/lib/funds/types";

type Entry = {
  fund: Fund;
  mandate: Mandate;
  profitUsdc: number | null;
};

type Slice = {
  slug: string;
  name: string;
  weight: number;
  profit: number;
};

type Rect = Slice & { x: number; y: number; w: number; h: number };

type Props = {
  entries: Entry[];
};

const CELL_GAP = 0.6; // % inset between cells

/** Binary space-partition treemap — fine for a handful of funds. */
function layoutTreemap(
  items: Slice[],
  x: number,
  y: number,
  w: number,
  h: number,
): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...items[0]!, x, y, w, h }];
  }

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let acc = 0;
  let split = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i]!.weight;
    if (acc >= total / 2) {
      split = i + 1;
      break;
    }
  }

  const left = items.slice(0, split);
  const right = items.slice(split);
  const leftWeight = left.reduce((sum, item) => sum + item.weight, 0);
  const ratio = leftWeight / total;

  if (w >= h) {
    return [
      ...layoutTreemap(left, x, y, w * ratio, h),
      ...layoutTreemap(right, x + w * ratio, y, w * (1 - ratio), h),
    ];
  }

  return [
    ...layoutTreemap(left, x, y, w, h * ratio),
    ...layoutTreemap(right, x, y + h * ratio, w, h * (1 - ratio)),
  ];
}

function pnlFill(profit: number, maxAbs: number): string {
  if (maxAbs <= 0 || Math.abs(profit) < 0.005) {
    return "#1a3324";
  }
  const t = Math.min(1, Math.abs(profit) / maxAbs);
  // Dark → bright along the Finviz-style heat scale
  if (profit > 0) {
    const g = Math.round(40 + t * 140);
    return `rgb(${Math.round(8 + t * 20)}, ${g}, ${Math.round(40 + t * 50)})`;
  }
  const r = Math.round(80 + t * 140);
  return `rgb(${r}, ${Math.round(28 + t * 20)}, ${Math.round(28 + t * 20)})`;
}

export default function MandateAllocationChart({ entries }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const slices = useMemo(() => {
    const mapped = entries
      .filter((entry) => entry.mandate.notionalUsdc > 0)
      .map((entry) => ({
        slug: entry.fund.slug,
        name: entry.fund.name,
        profit: entry.profitUsdc ?? 0,
        notional: entry.mandate.notionalUsdc,
      }));
    // Size by |P&L|; fall back to notional when everything is flat.
    const usePnl = mapped.some((slice) => Math.abs(slice.profit) >= 0.005);
    return mapped
      .map((slice) => ({
        slug: slice.slug,
        name: slice.name,
        profit: slice.profit,
        weight: usePnl
          ? Math.max(Math.abs(slice.profit), 0.01)
          : slice.notional,
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [entries]);

  const maxAbs = useMemo(
    () => Math.max(...slices.map((slice) => Math.abs(slice.profit)), 0),
    [slices],
  );

  const rects = useMemo(
    () => (slices.length > 0 ? layoutTreemap(slices, 0, 0, 100, 100) : []),
    [slices],
  );

  const empty = rects.length === 0;

  return (
    <div className="border-primary/10 border-b pb-6 pt-5">
      <div
        className="relative h-56 w-full bg-transparent sm:h-64"
        role="img"
        aria-label={
          empty
            ? "No mandate allocation yet"
            : `Mandate P&L across ${rects.length} funds`
        }
      >
        {empty ? (
          <div className="text-primary/45 flex h-full items-center justify-center text-sm">
            No mandates yet
          </div>
        ) : (
          <div className="relative h-full w-full">
            {rects.map((rect) => {
              const isHovered = hovered === rect.slug;
              const otherHovered = hovered !== null && !isHovered;
              const showAmount = isHovered || rect.w * rect.h > 120;
              const showName = isHovered || rect.w * rect.h > 40;
              return (
                <a
                  key={rect.slug}
                  href={`/funds/${rect.slug}`}
                  title={`${rect.name}: ${formatUsdExact(rect.profit, true)}`}
                  className="absolute flex flex-col items-center justify-center overflow-hidden px-1 text-center"
                  style={{
                    left: isHovered ? "0%" : `${rect.x + CELL_GAP}%`,
                    top: `${rect.y + CELL_GAP}%`,
                    width: isHovered
                      ? "100%"
                      : `${Math.max(0, rect.w - CELL_GAP * 2)}%`,
                    height: `${Math.max(0, rect.h - CELL_GAP * 2)}%`,
                    backgroundColor: pnlFill(rect.profit, maxAbs),
                    zIndex: isHovered ? 2 : 1,
                    opacity: otherHovered ? 0 : 1,
                    pointerEvents: otherHovered ? "none" : "auto",
                    transition:
                      "left 200ms ease, width 200ms ease, opacity 150ms ease",
                  }}
                  onMouseEnter={() => setHovered(rect.slug)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(rect.slug)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${rect.name}, ${formatUsdExact(rect.profit, true)}`}
                >
                  {showName && (
                    <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-white sm:text-xs">
                      {rect.name}
                    </span>
                  )}
                  {showAmount && (
                    <span className="mt-0.5 font-mono text-[10px] tabular-nums text-white/90 sm:text-xs">
                      {formatUsdExact(rect.profit, true)}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
