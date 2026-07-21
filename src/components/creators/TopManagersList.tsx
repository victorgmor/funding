import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CreatorName from "@/components/creators/CreatorName";
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
const positionClass =
  "text-primary/40 w-16 shrink-0 font-mono text-xs tabular-nums sm:w-20";

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
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <p className={positionClass}>
            <span className={headerClass}>Position</span>
          </p>
          <p className="min-w-0">
            <span className={headerClass}>Manager</span>
          </p>
        </div>
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
          className="border-primary/10 border-t py-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <span className={`${positionClass} text-sm`}>
                {index + 1}
              </span>
              <a
                href={creatorPath(manager.id)}
                className="group flex min-w-0 flex-1 items-center gap-2.5"
              >
                <CreatorAvatar
                  address={manager.id}
                  name={manager.name}
                  size="2xs"
                />
                <span className="inline-flex min-w-0 items-center gap-0.5">
                  <CreatorName
                    address={manager.id}
                    fallback={manager.name}
                    className="text-primary group-hover:text-primary/85 break-all font-mono text-sm font-semibold tracking-tight"
                  />
                  {manager.verified && (
                    <SealCheck size="xs" className="text-[#32BCFF] shrink-0" />
                  )}
                </span>
              </a>
            </div>

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
