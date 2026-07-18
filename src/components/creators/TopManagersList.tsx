import CreatorAvatar from "@/components/creators/CreatorAvatar";
import PnlAmount from "@/components/funds/PnlAmount";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import type { TopCreator } from "@/lib/funds/creators";
import { formatUsdExact } from "@/lib/funds/format";

type Props = {
  managers: TopCreator[];
};

const headerClass =
  "border-primary text-primary inline-block border-b-2 pb-2 text-sm font-medium";

const metricClass =
  "text-primary/70 w-14 shrink-0 text-right font-mono text-sm tabular-nums sm:w-16";

const headerMetricClass = "w-14 shrink-0 text-right sm:w-16";

export default function TopManagersList({ managers }: Props) {
  if (managers.length === 0) {
    return (
      <p className="text-primary/50 py-12 text-center text-sm">
        No managers with fund performance yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 flex-1">
          <span className={headerClass}>Manager</span>
        </p>
        <div className="flex shrink-0 items-center gap-4 sm:gap-6">
          <p className={headerMetricClass}>
            <span className={headerClass}>Funds</span>
          </p>
          <p className={`${headerMetricClass} hidden sm:block sm:w-20`}>
            <span className={headerClass}>Deposits</span>
          </p>
          <p className="w-24 text-right sm:w-28">
            <span className={headerClass}>PnL</span>
          </p>
        </div>
      </div>

      {managers.map((manager, index) => (
        <article
          key={manager.id}
          className="border-primary/10 border-b py-4 last:border-b-0"
        >
          <div className="flex items-center justify-between gap-4">
            <a
              href={creatorPath(manager.id)}
              className="group flex min-w-0 flex-1 items-center gap-2.5"
            >
              <span className="text-primary/40 w-5 shrink-0 text-center font-mono text-xs tabular-nums">
                {index + 1}
              </span>
              <CreatorAvatar
                address={manager.id}
                name={manager.name}
                size="2xs"
              />
              <span className="text-primary group-hover:text-primary/85 break-all font-mono text-sm font-semibold tracking-tight">
                {manager.id}
              </span>
              {manager.verified && (
                <SealCheck size="xs" className="text-[#32BCFF] shrink-0" />
              )}
            </a>

            <div className="text-primary/70 flex shrink-0 items-center gap-4 font-mono text-sm tabular-nums sm:gap-6">
              <span className={metricClass}>{manager.fundCount}</span>
              <span className={`hidden sm:block ${metricClass} sm:w-20`}>
                {formatUsdExact(manager.totalDepositedUsdc)}
              </span>
              <span className="w-24 text-right sm:w-28">
                <PnlAmount amount={manager.totalProfitUsdc} />
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
