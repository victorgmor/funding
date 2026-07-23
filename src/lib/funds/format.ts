const usdExact = (value: number) =>
  Math.abs(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function formatUsdExact(value: number, signed = false): string {
  const prefix = value < 0 ? "-" : signed && value > 0 ? "+" : "";
  return `${prefix}${usdExact(value)}`;
}

export function formatUsd(value: number, signed = false): string {
  const abs = Math.abs(value);
  let formatted: string;

  if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) formatted = `$${(abs / 1_000).toFixed(2)}K`;
  else formatted = `$${abs.toFixed(2)}`;

  if (signed && value > 0) return `+${formatted}`;
  if (signed && value < 0) return `-${formatted}`;
  return formatted;
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

const sinceDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "2-digit",
  month: "2-digit",
});

/** Local-TZ short date (dd/mm). SSR falls back to the host tz (UTC by default);
 *  client islands render the visitor's timezone. */
export function formatSinceDate(iso: string): string {
  return sinceDateFormatter.format(new Date(iso));
}

export function formatPublishedAgo(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;

  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;

  return formatSinceDate(iso);
}

export function formatCapFillLabel(
  deposited: number,
  cap: number | null | undefined,
): string {
  if (cap == null || cap <= 0) return "Uncapped";
  const pct = capProgress(deposited, cap);
  return `${pct}% full`;
}

export function capProgress(deposited: number, cap: number | null): number {
  if (cap === null || cap === 0) return 0;
  return Math.min(100, Math.round((deposited / cap) * 100));
}
