import { formatUsdExact } from "@/lib/funds/format";

type Props = { amount: number };

export default function PnlAmount({ amount }: Props) {
  const color =
    amount === 0
      ? "text-primary/45"
      : amount > 0
        ? "text-profit"
        : "text-red-500";

  return (
    <span className="inline-flex items-baseline gap-1 text-base">
      <span className={`font-mono tabular-nums ${color}`}>
        {formatUsdExact(amount, true)}
      </span>
      <span className="text-primary/45">PnL</span>
    </span>
  );
}
