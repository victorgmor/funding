type Props = { pct: number };

export default function ProfitShareLabel({ pct }: Props) {
  return (
    <span className="text-primary/45 inline-flex items-baseline gap-1 text-base">
      <span className="text-primary/70 font-mono tabular-nums">{pct}%</span>
      <span>profit share</span>
    </span>
  );
}
