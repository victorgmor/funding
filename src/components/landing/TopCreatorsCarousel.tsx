import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CreatorName from "@/components/creators/CreatorName";
import PnlAmount from "@/components/funds/PnlAmount";
import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import type { TopCreator } from "@/lib/funds/creators";

type Props = {
  creators: TopCreator[];
};

function loopCreators(creators: TopCreator[], min = 8): TopCreator[] {
  if (creators.length === 0) return [];
  const out: TopCreator[] = [];
  while (out.length < min) out.push(...creators);
  return out;
}

function CreatorItem({ creator }: { creator: TopCreator }) {
  return (
    <a
      href={creatorPath(creator.id)}
      className="text-primary/60 hover:text-primary inline-flex shrink-0 items-center gap-2 text-sm transition-colors"
    >
      <CreatorAvatar address={creator.id} name={creator.name} size="2xs" />
      <span className="text-primary inline-flex items-center gap-0.5 font-medium">
        <CreatorName address={creator.id} fallback={creator.name} />
        {creator.verified && (
          <SealCheck size="sm" className="!size-3.5 text-[#288cbc] shrink-0" />
        )}
      </span>
      <span className="text-primary/40 text-xs">
        {creator.fundCount} fund{creator.fundCount === 1 ? "" : "s"}
      </span>
      <PnlAmount amount={creator.totalProfitUsdc} />
    </a>
  );
}

export default function TopCreatorsCarousel({ creators }: Props) {
  if (creators.length === 0) return null;

  const track = [...loopCreators(creators), ...loopCreators(creators)];

  return (
    <section aria-label="Creator spotlights" className="group">
      <p className="text-primary/50 mb-3 text-sm">
        <a href="/leaderboard" className="hover:text-primary transition-colors">
          Leaderboard
        </a>
      </p>
      <div className="relative overflow-hidden">
        <div className="from-secondary pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r to-transparent" />
        <div className="from-secondary pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l to-transparent" />
        <div className="animate-marquee flex w-max transform-gpu items-center gap-10 will-change-transform group-hover:[animation-play-state:paused]">
          {track.map((creator, index) => (
            <CreatorItem key={`${creator.id}-${index}`} creator={creator} />
          ))}
        </div>
      </div>
    </section>
  );
}
