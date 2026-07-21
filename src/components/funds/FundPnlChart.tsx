import { useId, useMemo, useRef, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import {
  buildPnlSeries,
  defaultPnlRange,
  filterPnlSeries,
  PNL_RANGE_LABELS,
  PNL_RANGES,
  type PnlPoint,
  type PnlRange,
} from "@/lib/funds/pnl-series";
import type { MandateTrade } from "@/lib/funds/types";

type Props = {
  trades: MandateTrade[];
  fundCreatedAt?: string;
  embedded?: boolean;
};

const W = 640;
const H = 200;
const PAD = { top: 10, right: 0, bottom: 10, left: 0 };
const LINE_COLOR = "#288cbc";
/** ~one sample per few px — denser windows still look continuous. */
const TARGET_SAMPLES = 96;

function formatTooltipDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function niceStep(range: number, ticks = 4) {
  if (range <= 0) return 1;
  const rough = range / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function buildYScale(points: PnlPoint[]) {
  const values = points.map((point) => point.pnl);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const step = niceStep(
    Math.max(dataMax - dataMin, Math.abs(dataMax), Math.abs(dataMin), 1),
  );

  let min = Math.floor(Math.min(dataMin, 0) / step) * step;
  let max = Math.ceil(Math.max(dataMax, 0) / step) * step;

  if (min === max) {
    min -= step;
    max += step;
  }

  return { min, max };
}

function scaleLinear(
  value: number,
  domain: [number, number],
  range: [number, number],
) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/** Last known PnL at or before `t` (Polymarket-style hold). */
function valueAt(points: PnlPoint[], t: number): PnlPoint {
  const first = points[0]!;
  if (t <= first.t) return first;
  let index = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.t <= t) index = i;
    else break;
  }
  return points[index]!;
}

/**
 * Even time grid across the window + exact change times.
 * Between changes the value is held flat (same PnL for hours if nothing fills).
 */
function sampleHoldSeries(points: PnlPoint[]): PnlPoint[] {
  if (points.length < 2) return points;

  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  if (t1 <= t0) return points;

  const times = new Set<number>();
  for (let i = 0; i < TARGET_SAMPLES; i++) {
    times.add(t0 + ((t1 - t0) * i) / (TARGET_SAMPLES - 1));
  }
  for (const point of points) times.add(point.t);

  const sorted = [...times].sort((a, b) => a - b);
  return sorted.map((t) => {
    const held = valueAt(points, t);
    return { t, pnl: held.pnl, iso: held.iso };
  });
}

/** Step-after with filleted corners (Polymarket-ish blocks, not sharp 90°). */
const STEP_CORNER = 8;

function stepScreenPoints(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
) {
  return points.map((point) => ({
    x: xScale(point.t),
    y: yScale(point.pnl),
  }));
}

function roundedStepLine(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  const first = pts[0]!;
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  let cx = first.x;
  let cy = first.y;

  for (let i = 1; i < pts.length; i++) {
    const nx = pts[i]!.x;
    const ny = pts[i]!.y;
    const dy = ny - cy;
    const dx = nx - cx;

    if (Math.abs(dy) < 0.5) {
      d += ` H ${nx.toFixed(2)}`;
      cx = nx;
      continue;
    }

    const r = Math.min(
      STEP_CORNER,
      Math.abs(dx) / 2,
      Math.abs(dy) / 2,
    );

    if (r < 0.75) {
      d += ` H ${nx.toFixed(2)} V ${ny.toFixed(2)}`;
      cx = nx;
      cy = ny;
      continue;
    }

    const sy = Math.sign(dy) || 1;
    const isLast = i === pts.length - 1;

    // Horizontal into top corner, curve into vertical.
    d += ` H ${(nx - r).toFixed(2)}`;
    d += ` Q ${nx.toFixed(2)} ${cy.toFixed(2)} ${nx.toFixed(2)} ${(cy + sy * r).toFixed(2)}`;
    if (Math.abs(dy) > 2 * r + 0.5) {
      d += ` V ${(ny - sy * r).toFixed(2)}`;
    }
    if (isLast) {
      d += ` V ${ny.toFixed(2)}`;
      cx = nx;
      cy = ny;
    } else {
      d += ` Q ${nx.toFixed(2)} ${ny.toFixed(2)} ${(nx + r).toFixed(2)} ${ny.toFixed(2)}`;
      cx = nx + r;
      cy = ny;
    }
  }

  return d;
}

function stepPath(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
) {
  return roundedStepLine(stepScreenPoints(points, xScale, yScale));
}

function stepArea(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
  zeroY: number,
) {
  if (points.length === 0) return "";
  const pts = stepScreenPoints(points, xScale, yScale);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const line = roundedStepLine(pts);
  // Close under the rounded step from the true last sample x (not past-corner).
  return `${line} L ${last.x.toFixed(2)} ${zeroY.toFixed(2)} L ${first.x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
}

export default function FundPnlChart({
  trades,
  fundCreatedAt,
  embedded = false,
}: Props) {
  const gradientId = useId().replace(/:/g, "");
  const series = useMemo(
    () => buildPnlSeries(trades, fundCreatedAt),
    [trades, fundCreatedAt],
  );
  const [range, setRange] = useState<PnlRange>(() => defaultPnlRange(series));
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const eventPoints = useMemo(
    () => filterPnlSeries(series, range),
    [series, range],
  );
  const points = useMemo(
    () => sampleHoldSeries(eventPoints),
    [eventPoints],
  );

  if (series.length < 2) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { min: yMin, max: yMax } = buildYScale(points);
  const xMin = points[0]!.t;
  const xMax = points[points.length - 1]!.t;
  const latest = eventPoints[eventPoints.length - 1]!;

  const xScale = (t: number) =>
    scaleLinear(t, [xMin, xMax], [PAD.left, PAD.left + plotW]);
  const yScale = (v: number) =>
    scaleLinear(v, [yMin, yMax], [PAD.top + plotH, PAD.top]);
  const zeroY = yScale(0);

  const scrub = hover ? valueAt(eventPoints, hover.t) : null;
  const displayPnl = scrub?.pnl ?? latest.pnl;
  const dateLabel = scrub
    ? formatTooltipDate(new Date(hover!.t).toISOString())
    : PNL_RANGE_LABELS[range];
  const cursorX = hover?.x ?? null;
  const cursorY = scrub ? yScale(scrub.pnl) : null;

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;

    const rect = svg.getBoundingClientRect();
    const rawX = ((event.clientX - rect.left) / rect.width) * W;
    const x = Math.max(PAD.left, Math.min(PAD.left + plotW, rawX));
    const t = scaleLinear(x, [PAD.left, PAD.left + plotW], [xMin, xMax]);
    setHover({ x, t });
  }

  const content = (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {!embedded && (
            <span className="bg-[#288cbc]/15 text-[#288cbc] shrink-0 rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide">
              P&L
            </span>
          )}
          <div className="min-w-0">
            <p
              className={`font-mono text-2xl tabular-nums tracking-tight ${
                displayPnl >= 0 ? "text-profit" : "text-red-500"
              }`}
            >
              {formatUsdExact(displayPnl, true)}
            </p>
            <p className="text-primary/50 text-xs">{dateLabel}</p>
          </div>
        </div>

        <div className="text-primary/45 flex shrink-0 items-center gap-1 text-xs">
          {PNL_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={
                range === option
                  ? "text-primary px-2 py-0.5 font-medium"
                  : "hover:text-primary/70 px-2 py-0.5 transition-colors"
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none select-none overflow-visible"
          role="img"
          aria-label="Fund PnL over time"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity="0.22" />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            d={stepArea(points, xScale, yScale, zeroY)}
            fill={`url(#${gradientId})`}
          />
          <path
            d={stepPath(points, xScale, yScale)}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {cursorX != null && cursorY != null && (
            <>
              <line
                x1={cursorX}
                x2={cursorX}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={LINE_COLOR}
                strokeOpacity={0.4}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorX}
                cy={cursorY}
                r={3.5}
                fill={LINE_COLOR}
                stroke="#0f2918"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      </div>
    </>
  );

  if (embedded) return <div>{content}</div>;

  return <div className="border-primary/10 mt-6 border-t pt-4">{content}</div>;
}
