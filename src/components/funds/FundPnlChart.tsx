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
/** Even time samples — turns trade jumps into gentle slopes. */
const RESAMPLE_COUNT = 48;
const BLUR_PASSES = 2;

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

type ScreenPoint = { x: number; y: number };

type CurveSeg = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  m0: number;
  m1: number;
};

/** Resample + light blur so sudden fills become soft hills, not spikes. */
function softenSeries(points: PnlPoint[]): PnlPoint[] {
  if (points.length < 2) return points;

  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  if (t1 <= t0) return points;

  const sampled: PnlPoint[] = [];
  for (let i = 0; i < RESAMPLE_COUNT; i++) {
    const t = t0 + ((t1 - t0) * i) / (RESAMPLE_COUNT - 1);
    let lo = 0;
    while (lo < points.length - 2 && points[lo + 1]!.t < t) lo += 1;
    const a = points[lo]!;
    const b = points[Math.min(lo + 1, points.length - 1)]!;
    const span = b.t - a.t;
    const u = span <= 0 ? 0 : (t - a.t) / span;
    const pnl = a.pnl + (b.pnl - a.pnl) * Math.min(1, Math.max(0, u));
    sampled.push({
      t,
      pnl,
      iso: u < 0.5 ? a.iso : b.iso,
    });
  }

  let blurred = sampled;
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    blurred = blurred.map((point, index, arr) => {
      if (index === 0 || index === arr.length - 1) return point;
      const prev = arr[index - 1]!;
      const next = arr[index + 1]!;
      return {
        ...point,
        pnl: (prev.pnl + point.pnl * 2 + next.pnl) / 4,
      };
    });
  }

  // Keep endpoints exact so latest / origin match real PnL.
  blurred[0] = { ...blurred[0]!, pnl: points[0]!.pnl, iso: points[0]!.iso };
  blurred[blurred.length - 1] = {
    ...blurred[blurred.length - 1]!,
    pnl: points[points.length - 1]!.pnl,
    iso: points[points.length - 1]!.iso,
  };

  return blurred;
}

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

  // Cap slope so near-vertical trade jumps stay soft visually.
  const maxSlope = (PAD.top + (H - PAD.top - PAD.bottom)) / 40;
  for (let i = 0; i < n; i++) {
    slopes[i] = Math.max(-maxSlope, Math.min(maxSlope, slopes[i]!));
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
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * seg.y0 + h10 * dx * seg.m0 + h01 * seg.y1 + h11 * dx * seg.m1;
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

function smoothArea(segs: CurveSeg[], pts: ScreenPoint[], zeroY: number) {
  if (pts.length === 0) return "";
  const line = smoothLine(segs, pts);
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return `${line} L ${last.x.toFixed(2)} ${zeroY.toFixed(2)} L ${first.x.toFixed(2)} ${zeroY.toFixed(2)} Z`;
}

function pnlAtTime(points: PnlPoint[], t: number): { pnl: number; iso: string } {
  if (points.length === 0) return { pnl: 0, iso: new Date().toISOString() };
  if (t <= points[0]!.t) return { pnl: points[0]!.pnl, iso: points[0]!.iso };
  const last = points[points.length - 1]!;
  if (t >= last.t) return { pnl: last.pnl, iso: last.iso };

  let lo = 0;
  while (lo < points.length - 2 && points[lo + 1]!.t < t) lo += 1;
  const a = points[lo]!;
  const b = points[lo + 1]!;
  const span = b.t - a.t;
  const u = span <= 0 ? 0 : (t - a.t) / span;
  return {
    pnl: a.pnl + (b.pnl - a.pnl) * u,
    iso: u < 0.5 ? a.iso : b.iso,
  };
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

  const points = useMemo(
    () => filterPnlSeries(series, range),
    [series, range],
  );
  const drawPoints = useMemo(() => softenSeries(points), [points]);

  if (series.length < 2) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const { min: yMin, max: yMax } = buildYScale(drawPoints);
  const xMin = drawPoints[0]!.t;
  const xMax = drawPoints[drawPoints.length - 1]!.t;
  const latest = points[points.length - 1]!;

  const xScale = (t: number) =>
    scaleLinear(t, [xMin, xMax], [PAD.left, PAD.left + plotW]);
  const yScale = (v: number) =>
    scaleLinear(v, [yMin, yMax], [PAD.top + plotH, PAD.top]);
  const yUnscale = (y: number) =>
    scaleLinear(y, [PAD.top + plotH, PAD.top], [yMin, yMax]);
  const zeroY = yScale(0);
  const screen = toScreen(drawPoints, xScale, yScale);
  const segs = buildCurveSegs(screen);

  const cursorX = hover?.x ?? null;
  const cursorY = cursorX != null ? yOnCurve(segs, cursorX) : null;
  const scrub =
    hover != null
      ? {
          ...pnlAtTime(points, hover.t),
          // Match the visible line (softened) for the headline while scrubbing.
          pnl: yUnscale(yOnCurve(segs, hover.x)),
        }
      : null;
  const displayPnl = scrub?.pnl ?? latest.pnl;
  const dateLabel = scrub
    ? formatTooltipDate(new Date(hover!.t).toISOString())
    : PNL_RANGE_LABELS[range];

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || drawPoints.length === 0) return;

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
            d={smoothArea(segs, screen, zeroY)}
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
