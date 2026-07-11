import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import type { TopCreator } from "@/lib/funds/creators";

type Props = {
  creators: TopCreator[];
};

function CreatorItem({ creator }: { creator: TopCreator }) {
  return (
    <a
      href={creatorPath(creator.id)}
      className="text-primary/60 hover:text-primary inline-flex shrink-0 items-center gap-2 text-sm transition-colors"
    >
      <span className="text-primary font-medium">{creator.name}</span>
      {creator.verified && (
        <span className="inline-flex shrink-0 translate-z-0 items-center backface-hidden antialiased">
          <SealCheck size="sm" className="text-[#32BCFF]" />
        </span>
      )}
      <span className="text-primary/40 text-xs">
        {creator.bundleCount} call{creator.bundleCount === 1 ? "" : "s"}
      </span>
    </a>
  );
}

export default function TopCreatorsCarousel({ creators }: Props) {
  if (creators.length === 0) return null;

  return (
    <section aria-label="Creator spotlights">
      <p className="text-primary/50 mb-3 text-[0.65rem] font-medium tracking-wide uppercase">
        Creator spotlights
      </p>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        {creators.map((creator) => (
          <CreatorItem key={creator.id} creator={creator} />
        ))}
      </div>
    </section>
  );
}
