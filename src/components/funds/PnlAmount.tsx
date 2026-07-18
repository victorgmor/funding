import { formatUsdExact } from "@/lib/funds/format";

type Props = { amount: number };

export default function PnlAmount({ amount }: Props) {
  const color =
    amount === 0
      ? "text-primary/45"
      : amount > 0
        ? "text-emerald-400"
        : "text-red-400";

  return (
    <span className="inline-flex items-baseline gap-1 text-sm">
      <span className={`font-mono tabular-nums ${color}`}>
        {formatUsdExact(amount, true)}
      </span>
      <span className="text-primary/45">PnL</span>
    </span>
  );
}
