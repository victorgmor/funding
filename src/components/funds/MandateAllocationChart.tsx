import { useMemo, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import type { Fund, Mandate } from "@/lib/funds/types";

const PRIMARY_FILL = "var(--color-primary)";
const DEFAULT_FILL = "color-mix(in oklch, var(--color-primary) 20%, transparent)";

type Entry = {
  fund: Fund;
  mandate: Mandate;
};

type Slice = {
  slug: string;
  name: string;
  value: number;
  pct: number;
};

type Props = {
  entries: Entry[];
};

function buildSlices(entries: Entry[], total: number): Slice[] {
  return entries.map((entry) => {
    const value = entry.mandate.notionalUsdc;
    return {
      slug: entry.fund.slug,
      name: entry.fund.name,
      value,
      pct: (value / total) * 100,
    };
  });
}

export default function MandateAllocationChart({ entries }: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const total = entries.reduce((sum, entry) => sum + entry.mandate.notionalUsdc, 0);
  const slices = useMemo(
    () => (total > 0 ? buildSlices(entries, total) : []),
    [entries, total],
  );
  const empty = slices.length === 0;

  const activeSlice = slices.find((slice) => slice.slug === activeSlug) ?? null;

  function sliceFill(isActive: boolean) {
    return isActive ? PRIMARY_FILL : DEFAULT_FILL;
  }

  return (
    <div className="border-primary/10 border-b px-2 pb-6 pt-5">
      <div
        className="relative h-28 w-full"
        role="img"
        aria-label={
          empty
            ? "No mandate allocation yet"
            : `Mandate allocation across ${slices.length} funds`
        }
      >
        <div
          className="grid h-full w-full gap-1"
          style={
            empty
              ? undefined
              : { gridTemplateColumns: slices.map((slice) => `${slice.pct}fr`).join(" ") }
          }
        >
          {empty ? (
            <div
              className="bg-primary/20 h-full rounded-md"
              aria-hidden
            />
          ) : (
            slices.map((slice) => {
              const isActive = activeSlug === slice.slug;
              return (
                <a
                  key={slice.slug}
                  href={`/funds/${slice.slug}`}
                  onMouseEnter={() => setActiveSlug(slice.slug)}
                  onMouseLeave={() => setActiveSlug(null)}
                  onFocus={() => setActiveSlug(slice.slug)}
                  onBlur={() => setActiveSlug(null)}
                  className={`block h-full min-w-0 rounded-md transition-[transform,opacity] duration-200 outline-none ${
                    isActive ? "scale-[1.02] opacity-100" : "opacity-90 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: sliceFill(isActive) }}
                  aria-label={`${slice.name}, ${formatUsdExact(slice.value)}, ${Math.round(slice.pct)} percent`}
                />
              );
            })
          )}
        </div>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <p className="text-primary/50 line-clamp-2 text-sm uppercase tracking-wide">
            {activeSlice ? activeSlice.name : "Invested"}
          </p>
          <p className="text-primary mt-0.5 font-mono text-base font-semibold leading-tight tabular-nums sm:text-lg">
            {formatUsdExact(activeSlice ? activeSlice.value : total)}
          </p>
        </div>
      </div>

      {empty ? (
        <p className="text-primary/45 mt-5 text-center text-sm">
          No mandates yet
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {slices.map((slice) => {
            const isActive = activeSlug === slice.slug;
            return (
              <li key={slice.slug}>
                <a
                  href={`/funds/${slice.slug}`}
                  onMouseEnter={() => setActiveSlug(slice.slug)}
                  onMouseLeave={() => setActiveSlug(null)}
                  className={`group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-primary/70 hover:bg-primary/5 hover:text-primary"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2.5 shrink-0 rounded-sm transition-all duration-200 ${
                        isActive ? "scale-125" : ""
                      }`}
                      style={{
                        backgroundColor: isActive ? PRIMARY_FILL : DEFAULT_FILL,
                      }}
                      aria-hidden
                    />
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span
                    className={`shrink-0 font-mono text-xs tabular-nums ${
                      isActive ? "text-primary/70" : "text-primary/45 group-hover:text-primary/70"
                    }`}
                  >
                    {formatUsdExact(slice.value)} · {Math.round(slice.pct)}%
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
