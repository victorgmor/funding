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
/** Regular samples across the window; value held between real fills. */
const TARGET_SAMPLES = 80;
/** Polyline resolution for hover + matching the visible spline. */
const CURVE_SAMPLES = 200;

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

/** Even time grid + change times; hold last PnL between fills. */
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

  return [...times].sort((a, b) => a - b).map((t) => {
    const held = valueAt(points, t);
    return { t, pnl: held.pnl, iso: held.iso };
  });
}

type Pt = { x: number; y: number };

function toScreen(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
): Pt[] {
  return points.map((point) => ({
    x: xScale(point.t),
    y: yScale(point.pnl),
  }));
}

/** Catmull-Rom → cubic beziers (soft hills like the reference). */
function catmullRomLine(pts: Pt[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    return `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  }
  if (pts.length === 2) {
    return `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)} L ${pts[1]!.x.toFixed(2)} ${pts[1]!.y.toFixed(2)}`;
  }

  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Area under the curve down to the chart bottom — always below the line
 * on screen, whether PnL is above or below zero.
 */
function areaUnderCurve(pts: Pt[], bottomY: number) {
  if (pts.length === 0) return "";
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const line = catmullRomLine(pts);
  // Bottom → up to curve → along curve → down to bottom (always under the line).
  return `M ${first.x.toFixed(2)} ${bottomY.toFixed(2)} ${line.replace(/^M/, "L")} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
}

function sampleCurve(pts: Pt[], count: number): Pt[] {
  if (pts.length < 2) return pts;
  const out: Pt[] = [];
  const n = pts.length - 1;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const f = u * n;
    const i0 = Math.min(Math.floor(f), n - 1);
    const t = f - i0;
    const p0 = pts[i0 - 1] ?? pts[i0]!;
    const p1 = pts[i0]!;
    const p2 = pts[i0 + 1]!;
    const p3 = pts[i0 + 2] ?? p2;
    // Catmull-Rom interpolate
    const t2 = t * t;
    const t3 = t2 * t;
    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
    out.push({ x, y });
  }
  return out;
}

function yOnPolyline(poly: Pt[], x: number): number {
  if (poly.length === 0) return 0;
  if (x <= poly[0]!.x) return poly[0]!.y;
  const last = poly[poly.length - 1]!;
  if (x >= last.x) return last.y;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    if (x >= a.x && x <= b.x) {
      const u = (x - a.x) / Math.max(b.x - a.x, 1e-6);
      return a.y + (b.y - a.y) * u;
    }
  }
  return last.y;
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
  const bottomY = PAD.top + plotH;

  const xScale = (t: number) =>
    scaleLinear(t, [xMin, xMax], [PAD.left, PAD.left + plotW]);
  const yScale = (v: number) =>
    scaleLinear(v, [yMin, yMax], [PAD.top + plotH, PAD.top]);
  const yUnscale = (y: number) =>
    scaleLinear(y, [PAD.top + plotH, PAD.top], [yMin, yMax]);

  const screen = toScreen(points, xScale, yScale);
  const curvePoly = sampleCurve(screen, CURVE_SAMPLES);
  const linePath = catmullRomLine(screen);
  const areaPath = areaUnderCurve(screen, bottomY);

  const cursorX = hover?.x ?? null;
  const cursorY = cursorX != null ? yOnPolyline(curvePoly, cursorX) : null;
  const displayPnl =
    cursorY != null ? yUnscale(cursorY) : latest.pnl;
  const dateLabel = hover
    ? formatTooltipDate(new Date(hover.t).toISOString())
    : PNL_RANGE_LABELS[range];

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
            {/* Fade from the line toward the chart bottom (user space). */}
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={PAD.top}
              x2={0}
              y2={bottomY}
            >
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity="0.28" />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {cursorX != null && cursorY != null && (
            <>
              <line
                x1={cursorX}
                x2={cursorX}
                y1={PAD.top}
                y2={bottomY}
                stroke={LINE_COLOR}
                strokeOpacity={0.35}
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={cursorX}
                cy={cursorY}
                r={4}
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
