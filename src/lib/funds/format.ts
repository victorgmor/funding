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

export function formatSinceDate(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function capLabel(deposited: number, cap: number | null): string {
  if (cap === null) return "Unlimited";
  const pct = Math.round((deposited / cap) * 100);
  return `${pct}% of cap`;
}

export function capProgress(deposited: number, cap: number | null): number {
  if (cap === null || cap === 0) return 0;
  return Math.min(100, Math.round((deposited / cap) * 100));
}
