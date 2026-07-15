import CreatorAvatar from "@/components/creators/CreatorAvatar";
import PnlAmount from "@/components/funds/PnlAmount";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import type { TopCreator } from "@/lib/funds/creators";

type Props = {
  managers: TopCreator[];
};

export default function TopManagersList({ managers }: Props) {
  if (managers.length === 0) {
    return (
      <p className="text-primary/50 text-sm">
        No managers with fund performance yet.
      </p>
    );
  }

  return (
    <ol className="divide-primary/10 border-primary/10 divide-y border-y">
      {managers.map((manager, index) => (
        <li key={manager.id}>
          <a
            href={creatorPath(manager.id)}
            className="hover:bg-primary/5 flex items-center gap-4 px-2 py-4 transition-colors"
          >
            <span className="text-primary/40 w-8 shrink-0 text-center font-mono text-sm tabular-nums">
              {index + 1}
            </span>
            <CreatorAvatar
              address={manager.id}
              name={manager.name}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-primary truncate font-medium">
                  {manager.name}
                </span>
                {manager.verified && (
                  <SealCheck size="sm" className="text-[#32BCFF]" />
                )}
              </div>
              <p className="text-primary/50 text-xs">
                {manager.fundCount} fund{manager.fundCount === 1 ? "" : "s"}
              </p>
            </div>
            <PnlAmount amount={manager.totalProfitUsdc} />
          </a>
        </li>
      ))}
    </ol>
  );
}
