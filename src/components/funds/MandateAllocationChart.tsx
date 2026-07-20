import { useMemo } from "react";
import { formatUsdExact } from "@/lib/funds/format";

export type DayActivity = {
  date: string;
  value: number;
  fundSlug: string;
};

type Props = {
  activity: DayActivity[];
};

const WEEKS = 53;
const EMPTY = "color-mix(in oklch, black 8%, #d6dfc9)";
const LEVELS = [
  "color-mix(in oklch, #179e63 22%, #d6dfc9)",
  "color-mix(in oklch, #179e63 40%, #d6dfc9)",
  "color-mix(in oklch, #179e63 62%, #d6dfc9)",
  "#179e63",
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function buildWeeks(byDate: Map<string, number>) {
  const today = startOfUtcDay(utcDay(new Date()));
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - today.getUTCDay()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (WEEKS * 7 - 1));

  const weeks: { date: string; value: number; month: number }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(start);
      cell.setUTCDate(start.getUTCDate() + w * 7 + d);
      const date = utcDay(cell);
      days.push({
        date,
        value: byDate.get(date) ?? 0,
        month: cell.getUTCMonth(),
      });
    }
    weeks.push(days);
  }
  return weeks;
}

function levelFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const t = value / max;
  if (t > 0.75) return 4;
  if (t > 0.5) return 3;
  if (t > 0.25) return 2;
  return 1;
}

export default function MandateAllocationChart({ activity }: Props) {
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of activity) {
      map.set(row.date, (map.get(row.date) ?? 0) + row.value);
    }
    return map;
  }, [activity]);

  const weeks = useMemo(() => buildWeeks(byDate), [byDate]);
  const max = useMemo(
    () => Math.max(0, ...weeks.flatMap((w) => w.map((d) => d.value))),
    [weeks],
  );

  const monthLabels = useMemo(() => {
    const labels: (string | null)[] = [];
    let prev = -1;
    for (const week of weeks) {
      const month = week[0]?.month ?? -1;
      if (month !== prev) {
        labels.push(MONTHS[month] ?? null);
        prev = month;
      } else {
        labels.push(null);
      }
    }
    return labels;
  }, [weeks]);

  return (
    <div className="border-primary/10 border-b overflow-x-auto pb-6 pt-5">
      <div
        className="inline-block min-w-full"
        role="img"
        aria-label="Mandate trading activity over the past year"
      >
        <div className="mb-1.5 flex gap-[3px] pl-7">
          {monthLabels.map((label, i) => (
            <div
              key={i}
              className="text-primary/45 flex w-2.5 shrink-0 justify-start text-[10px] leading-none sm:w-3 sm:text-xs"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex gap-1.5">
          <div className="text-primary/45 flex w-6 shrink-0 flex-col gap-[3px] text-[10px] leading-none sm:text-xs">
            <span className="h-2.5 sm:h-3" />
            <span className="flex h-2.5 items-center sm:h-3">Mon</span>
            <span className="h-2.5 sm:h-3" />
            <span className="flex h-2.5 items-center sm:h-3">Wed</span>
            <span className="h-2.5 sm:h-3" />
            <span className="flex h-2.5 items-center sm:h-3">Fri</span>
            <span className="h-2.5 sm:h-3" />
          </div>

          <div className="flex gap-[3px]">
            {weeks.map((days, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {days.map((day) => {
                  const level = levelFor(day.value, max);
                  const fill = level === 0 ? EMPTY : LEVELS[level - 1]!;
                  return (
                    <div
                      key={day.date}
                      title={
                        day.value > 0
                          ? `${day.date}: ${formatUsdExact(day.value)} activity`
                          : day.date
                      }
                      className="size-2.5 rounded-[2px] sm:size-3"
                      style={{ backgroundColor: fill }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
