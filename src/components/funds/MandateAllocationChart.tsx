import { useMemo, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import type { Fund, Mandate } from "@/lib/funds/types";

type Entry = {
  fund: Fund;
  mandate: Mandate;
  profitUsdc: number | null;
};

type Props = {
  entries: Entry[];
  /** Render the grid as a pulsing skeleton while entries load. */
  loading?: boolean;
};

const COLS = 20;
const ROWS = 5;
const CELLS = COLS * ROWS;

const EMPTY = "color-mix(in oklch, black 10%, #d6dfc9)";

function pnlFill(profit: number): string {
  if (profit > 0) return "var(--color-profit)";
  if (profit < 0) return "var(--color-red-500)";
  return EMPTY;
}

type Slice = {
  slug: string;
  name: string;
  profit: number;
  weight: number;
};

/** Largest-remainder allocation of `total` cells by weight. */
function allocateCells(slices: Slice[], total: number): Slice[] {
  if (slices.length === 0 || total <= 0) return [];
  const sum = slices.reduce((s, x) => s + x.weight, 0);
  if (sum <= 0) return [];

  const raw = slices.map((slice) => {
    const exact = (slice.weight / sum) * total;
    return { slice, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let used = raw.reduce((s, r) => s + r.floor, 0);
  const ranked = [...raw].sort((a, b) => b.frac - a.frac);
  for (const row of ranked) {
    if (used >= total) break;
    row.floor += 1;
    used += 1;
  }
  return raw.flatMap(({ slice, floor }) =>
    Array.from({ length: floor }, () => slice),
  );
}

export default function MandateAllocationChart({
  entries,
  loading = false,
}: Props) {
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
    const usePnl = mapped.some((s) => Math.abs(s.profit) >= 0.005);
    return mapped
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        profit: s.profit,
        weight: usePnl ? Math.max(Math.abs(s.profit), 0.01) : s.notional,
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [entries]);

  const cells = useMemo(() => allocateCells(slices, CELLS), [slices]);

  if (loading) {
    // Same grid shape as the loaded chart — skeleton cells, no layout shift.
    return (
      <div className="border-primary/10 border-b pb-6 pt-5">
        <div
          className="animate-pulse grid w-full gap-1.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {Array.from({ length: CELLS }, (_, i) => (
            <div key={i} className="bg-primary/10 aspect-square rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border-primary/10 border-b pb-6 pt-5">
      <div
        className="grid w-full gap-1.5"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        role="img"
        aria-label={
          cells.length === 0
            ? "No mandate allocation yet"
            : `Mandate mix across ${slices.length} funds`
        }
      >
        {Array.from({ length: CELLS }, (_, i) => {
          const slice = cells[i];
          if (!slice) {
            return (
              <div
                key={i}
                className="aspect-square rounded-md"
                style={{ backgroundColor: EMPTY }}
              />
            );
          }
          const dimmed = hovered !== null && hovered !== slice.slug;
          return (
            <a
              key={`${slice.slug}-${i}`}
              href={`/funds/${slice.slug}`}
              title={`${slice.name}: ${formatUsdExact(slice.profit, true)}`}
              className="aspect-square rounded-md transition-opacity"
              style={{
                backgroundColor: pnlFill(slice.profit),
                opacity: dimmed ? 0.35 : 1,
              }}
              onMouseEnter={() => setHovered(slice.slug)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(slice.slug)}
              onBlur={() => setHovered(null)}
              aria-label={`${slice.name}, ${formatUsdExact(slice.profit, true)}`}
            />
          );
        })}
      </div>
    </div>
  );
}
