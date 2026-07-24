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
  /** Current fund-list Σ trade PnL — series tip only (not historical fills). */
  currentPnl?: number | null;
  fundCreatedAt?: string;
  embedded?: boolean;
};

const W = 640;
const H = 200;
const PAD = { top: 10, right: 0, bottom: 10, left: 0 };
const LINE_COLOR = "#288cbc";
/** Regular samples across the window; value held between real fills. */
const TARGET_SAMPLES = 80;
/** Points along each level→level cosine ramp (no overshoot). */
const COSINE_STEPS = 16;

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

/** Cosine ease 0→1 — smoothstep without overshoot (raised cosine). */
function cosineEase(u: number) {
  return (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;
}

/**
 * Hold-forward on a regular grid, then ease between levels with a cosine ramp.
 * Flats stay flat; jumps become soft S-curves with no Catmull bumps.
 */
function sampleCosineSeries(points: PnlPoint[]): PnlPoint[] {
  if (points.length < 2) return points;

  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  if (t1 <= t0) return points;

  const times = new Set<number>();
  for (let i = 0; i < TARGET_SAMPLES; i++) {
    times.add(t0 + ((t1 - t0) * i) / (TARGET_SAMPLES - 1));
  }
  for (const point of points) times.add(point.t);

  const held = [...times].sort((a, b) => a - b).map((t) => {
    const v = valueAt(points, t);
    return { t, pnl: v.pnl, iso: v.iso };
  });

  // Plateau edges only.
  const keys: PnlPoint[] = [];
  for (let i = 0; i < held.length; i++) {
    const point = held[i]!;
    const prev = keys[keys.length - 1];
    const next = held[i + 1];
    if (
      !prev ||
      Math.abs(prev.pnl - point.pnl) > 1e-9 ||
      !next ||
      Math.abs(next.pnl - point.pnl) > 1e-9
    ) {
      keys.push(point);
    }
  }

  const out: PnlPoint[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    out.push(a);
    if (Math.abs(a.pnl - b.pnl) < 1e-9 || b.t <= a.t) continue;

    for (let s = 1; s < COSINE_STEPS; s++) {
      const u = s / COSINE_STEPS;
      const e = cosineEase(u);
      out.push({
        t: a.t + (b.t - a.t) * u,
        pnl: a.pnl + (b.pnl - a.pnl) * e,
        iso: e < 0.5 ? a.iso : b.iso,
      });
    }
  }
  out.push(keys[keys.length - 1]!);
  return out;
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

/** Straight segments through cosine samples — already smooth, no spline wiggle. */
function linePath(pts: Pt[]) {
  if (pts.length === 0) return "";
  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x.toFixed(2)} ${pts[i]!.y.toFixed(2)}`;
  }
  return d;
}

function areaUnderCurve(pts: Pt[], bottomY: number) {
  if (pts.length === 0) return "";
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const line = linePath(pts);
  return `M ${first.x.toFixed(2)} ${bottomY.toFixed(2)} ${line.replace(/^M/, "L")} L ${last.x.toFixed(2)} ${bottomY.toFixed(2)} Z`;
}

function yOnPolyline(pts: Pt[], x: number): number {
  if (pts.length === 0) return 0;
  if (x <= pts[0]!.x) return pts[0]!.y;
  const last = pts[pts.length - 1]!;
  if (x >= last.x) return last.y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (x >= a.x && x <= b.x) {
      const u = (x - a.x) / Math.max(b.x - a.x, 1e-6);
      return a.y + (b.y - a.y) * u;
    }
  }
  return last.y;
}

export default function FundPnlChart({
  trades,
  currentPnl,
  fundCreatedAt,
  embedded = false,
}: Props) {
  const gradientId = useId().replace(/:/g, "");
  const series = useMemo(
    () => buildPnlSeries(trades, fundCreatedAt, currentPnl),
    [trades, fundCreatedAt, currentPnl],
  );
  const [range, setRange] = useState<PnlRange>(() => defaultPnlRange(series));
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const eventPoints = useMemo(
    () => filterPnlSeries(series, range),
    [series, range],
  );
  const points = useMemo(
    () => sampleCosineSeries(eventPoints),
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
  const pathLine = linePath(screen);
  const pathArea = areaUnderCurve(screen, bottomY);

  const cursorX = hover?.x ?? null;
  const cursorY = cursorX != null ? yOnPolyline(screen, cursorX) : null;
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

          <path d={pathArea} fill={`url(#${gradientId})`} />
          <path
            d={pathLine}
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

  return <div className="">{content}</div>;
}
