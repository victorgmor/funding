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
/** Even samples across the window — value held between real changes. */
const TARGET_SAMPLES = 64;

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

/** Last known PnL at or before `t` (hold-forward). */
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
 * Regular time grid + change times, hold value between fills.
 * Then collapse flat runs so the curve can ease between levels.
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

  const sampled = [...times].sort((a, b) => a - b).map((t) => {
    const held = valueAt(points, t);
    return { t, pnl: held.pnl, iso: held.iso };
  });

  // Keep first/last of each plateau — smooth cubic then eases between levels.
  const collapsed: PnlPoint[] = [];
  for (let i = 0; i < sampled.length; i++) {
    const point = sampled[i]!;
    const prev = collapsed[collapsed.length - 1];
    const next = sampled[i + 1];
    if (
      !prev ||
      Math.abs(prev.pnl - point.pnl) > 1e-9 ||
      !next ||
      Math.abs(next.pnl - point.pnl) > 1e-9
    ) {
      collapsed.push(point);
    }
  }
  return collapsed;
}

type ScreenPoint = { x: number; y: number };
type CurveSeg = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  m0: number;
  m1: number;
};

function toScreen(
  points: PnlPoint[],
  xScale: (t: number) => number,
  yScale: (v: number) => number,
): ScreenPoint[] {
  return points.map((point) => ({
    x: xScale(point.t),
    y: yScale(point.pnl),
  }));
}

/** Monotone cubic — smooth curves, no overshoot on flats. */
function buildCurveSegs(pts: ScreenPoint[]): CurveSeg[] {
  if (pts.length < 2) return [];

  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dxi = Math.max(pts[i + 1]!.x - pts[i]!.x, 1e-6);
    dx[i] = dxi;
    m[i] = (pts[i + 1]!.y - pts[i]!.y) / dxi;
  }

  const slopes = new Array<number>(n);
  slopes[0] = m[0]!;
  slopes[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    slopes[i] =
      m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]!) < 1e-12) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      continue;
    }
    const a = slopes[i]! / m[i]!;
    const b = slopes[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      slopes[i] = t * a * m[i]!;
      slopes[i + 1] = t * b * m[i]!;
    }
  }

  const segs: CurveSeg[] = [];
  for (let i = 0; i < n - 1; i++) {
    segs.push({
      x0: pts[i]!.x,
      y0: pts[i]!.y,
      x1: pts[i + 1]!.x,
      y1: pts[i + 1]!.y,
      m0: slopes[i]!,
      m1: slopes[i + 1]!,
    });
  }
  return segs;
}

function yOnCurve(segs: CurveSeg[], x: number): number {
  if (segs.length === 0) return 0;
  const first = segs[0]!;
  const last = segs[segs.length - 1]!;
  if (x <= first.x0) return first.y0;
  if (x >= last.x1) return last.y1;

  const seg = segs.find((s) => x >= s.x0 && x <= s.x1) ?? last;
  const dx = seg.x1 - seg.x0;
  const t = dx <= 0 ? 0 : (x - seg.x0) / dx;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * seg.y0 +
    (t3 - 2 * t2 + t) * dx * seg.m0 +
    (-2 * t3 + 3 * t2) * seg.y1 +
    (t3 - t2) * dx * seg.m1
  );
}

function smoothLine(segs: CurveSeg[], pts: ScreenPoint[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1 || segs.length === 0) {
    return `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  }

  let path = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (const seg of segs) {
    const dx = seg.x1 - seg.x0;
    path += ` C ${(seg.x0 + dx / 3).toFixed(2)} ${(seg.y0 + (seg.m0 * dx) / 3).toFixed(2)}, ${(seg.x1 - dx / 3).toFixed(2)} ${(seg.y1 - (seg.m1 * dx) / 3).toFixed(2)}, ${seg.x1.toFixed(2)} ${seg.y1.toFixed(2)}`;
  }
  return path;
}

function smoothArea(segs: CurveSeg[], pts: ScreenPoint[], bottomY: number) {
  if (pts.length === 0) return "";
  const line = smoothLine(segs, pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  // Always fill below the line toward the chart bottom (works for +/− PnL).
  return `${line} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} L ${first.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
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
  const yUnscale = (y: number) =>
    scaleLinear(y, [PAD.top + plotH, PAD.top], [yMin, yMax]);
  const bottomY = PAD.top + plotH;
  const screen = toScreen(points, xScale, yScale);
  const segs = buildCurveSegs(screen);

  const scrubHeld = hover ? valueAt(eventPoints, hover.t) : null;
  const cursorX = hover?.x ?? null;
  const cursorY = cursorX != null ? yOnCurve(segs, cursorX) : null;
  const displayPnl =
    cursorY != null ? yUnscale(cursorY) : latest.pnl;
  const dateLabel = scrubHeld
    ? formatTooltipDate(new Date(hover!.t).toISOString())
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
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE_COLOR} stopOpacity="0.22" />
              <stop offset="100%" stopColor={LINE_COLOR} stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            d={smoothArea(segs, screen, bottomY)}
            fill={`url(#${gradientId})`}
          />
          <path
            d={smoothLine(segs, screen)}
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
