import { useMemo, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import type { Fund, Mandate } from "@/lib/funds/types";

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 118;
const INNER_R = 72;
/** Uniform gap width (viewBox px) — stroke, not angular wedge. */
const GAP_STROKE = 8;

const PRIMARY_FILL = "var(--color-primary)";
const IDLE_FILL = "color-mix(in oklch, var(--color-primary) 10%, transparent)";
const PLACEHOLDER_FILL = "color-mix(in oklch, var(--color-primary) 20%, transparent)";

type Entry = {
  fund: Fund;
  mandate: Mandate;
};

type Slice = {
  slug: string;
  name: string;
  value: number;
  pct: number;
  startDeg: number;
  endDeg: number;
  midDeg: number;
};

type Props = {
  entries: Entry[];
};

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
) {
  const startOuter = polar(cx, cy, outerR, startDeg);
  const endOuter = polar(cx, cy, outerR, endDeg);
  const startInner = polar(cx, cy, innerR, endDeg);
  const endInner = polar(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

function buildSlices(entries: Entry[], total: number): Slice[] {
  let cursor = 0;

  return entries.map((entry) => {
    const value = entry.mandate.notionalUsdc;
    const sweep = (value / total) * 360;
    const startDeg = cursor;
    const endDeg = cursor + sweep;
    cursor = endDeg;

    return {
      slug: entry.fund.slug,
      name: entry.fund.name,
      value,
      pct: (value / total) * 100,
      startDeg,
      endDeg,
      midDeg: startDeg + sweep / 2,
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
  const singleSlice = slices.length === 1;

  function sliceFill(isActive: boolean) {
    if (isActive || singleSlice) return PRIMARY_FILL;
    return IDLE_FILL;
  }

  return (
    <div className="border-primary/10 border-b px-2 pb-6 pt-5">
      <div className="relative mx-auto w-full max-w-[20rem] sm:max-w-[22rem]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="size-full"
          role="img"
          aria-label={
            empty
              ? "No mandate allocation yet"
              : `Mandate allocation across ${slices.length} funds`
          }
        >
          {empty ? (
            <path
              d={arcPath(CX, CY, OUTER_R, INNER_R, 0, 359.99)}
              fill={PLACEHOLDER_FILL}
              aria-hidden
            />
          ) : (
            slices.map((slice) => {
            const isActive = activeSlug === slice.slug;
            const outerR = isActive ? OUTER_R + 5 : OUTER_R;
            const path = arcPath(CX, CY, outerR, INNER_R, slice.startDeg, slice.endDeg);

            return (
              <a
                key={slice.slug}
                href={`/funds/${slice.slug}`}
                className="outline-none"
                onMouseEnter={() => setActiveSlug(slice.slug)}
                onMouseLeave={() => setActiveSlug(null)}
                onFocus={() => setActiveSlug(slice.slug)}
                onBlur={() => setActiveSlug(null)}
              >
                <g
                  transform={
                    isActive
                      ? `translate(${CX} ${CY}) scale(1.04) translate(${-CX} ${-CY})`
                      : undefined
                  }
                >
                  <path
                    d={path}
                    fill={sliceFill(isActive)}
                    stroke="var(--color-secondary)"
                    strokeWidth={entries.length > 1 ? GAP_STROKE : 0}
                    strokeLinejoin="round"
                    className="transition-[fill] duration-200"
                  />
                </g>
              </a>
            );
          })
          )}
        </svg>

        <div className="pointer-events-none absolute inset-[26%] flex flex-col items-center justify-center rounded-full px-3 text-center">
          <p className="text-primary/50 line-clamp-2 text-[0.65rem] uppercase tracking-wide">
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
                    className={`size-2.5 shrink-0 rounded-full transition-all duration-200 ${
                      isActive ? "scale-125" : ""
                    }`}
                    style={{
                      backgroundColor:
                        isActive || singleSlice ? PRIMARY_FILL : IDLE_FILL,
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
