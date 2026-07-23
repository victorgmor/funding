type Props = {
  /** Size + rounding classes, e.g. "h-4 w-24 rounded". */
  className?: string;
};

/** Shared loading block — muted rounded bar matching FundPoolOverview's skeleton. */
export default function Skeleton({ className = "" }: Props) {
  return (
    <div aria-hidden="true" className={`bg-primary/10 animate-pulse ${className}`} />
  );
}
