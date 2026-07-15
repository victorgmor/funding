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
  "text-primary/50 px-4 py-3 text-left text-[0.65rem] font-medium uppercase tracking-wide";

export default function TopManagersList({ managers }: Props) {
  if (managers.length === 0) {
    return (
      <p className="text-primary/50 text-sm">
        No managers with fund performance yet.
      </p>
    );
  }

  return (
    <div className="border-primary/10 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="border-primary/10 border-b">
          <tr>
            <th className={`${headerClass} w-12 text-center`}>#</th>
            <th className={headerClass}>Manager</th>
            <th className={`${headerClass} text-right`}>Funds</th>
            <th className={`${headerClass} text-right`}>Deposits</th>
            <th className={`${headerClass} text-right`}>PnL</th>
          </tr>
        </thead>
        <tbody className="divide-primary/10 divide-y">
          {managers.map((manager, index) => (
            <tr
              key={manager.id}
              className="hover:bg-primary/5 transition-colors"
            >
              <td className="text-primary/40 px-4 py-4 text-center font-mono text-xs tabular-nums">
                {index + 1}
              </td>
              <td className="px-4 py-4">
                <a
                  href={creatorPath(manager.id)}
                  className="flex min-w-0 items-center gap-3"
                >
                  <CreatorAvatar
                    address={manager.id}
                    name={manager.name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-primary truncate font-medium">
                        {manager.name}
                      </span>
                      {manager.verified && (
                        <SealCheck size="sm" className="text-[#32BCFF]" />
                      )}
                    </div>
                  </div>
                </a>
              </td>
              <td className="text-primary/70 px-4 py-4 text-right font-mono text-xs tabular-nums">
                {manager.fundCount}
              </td>
              <td className="text-primary/70 px-4 py-4 text-right font-mono text-xs tabular-nums">
                {formatUsdExact(manager.totalDepositedUsdc)}
              </td>
              <td className="px-4 py-4 text-right">
                <PnlAmount amount={manager.totalProfitUsdc} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
