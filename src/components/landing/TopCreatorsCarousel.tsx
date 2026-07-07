import SealCheck from "@/components/fundations/icons/SealCheck";
import { creatorPath } from "@/lib/funds/creator";
import { formatPercent } from "@/lib/funds/format";
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
  const roiPositive = (creator.bestRoi ?? 0) >= 0;

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
        {creator.bundleCount} bundle{creator.bundleCount === 1 ? "" : "s"}
      </span>
      {creator.bestRoi != null && (
        <span
          className={`font-mono text-xs tabular-nums ${
            roiPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {formatPercent(creator.bestRoi)}
        </span>
      )}
    </a>
  );
}

export default function TopCreatorsCarousel({ creators }: Props) {
  if (creators.length === 0) return null;

  const track = [...loopCreators(creators), ...loopCreators(creators)];

  return (
    <section aria-label="Top creators" className="group">
      <p className="text-primary/50 mb-3 text-[0.65rem] font-medium tracking-wide uppercase">
        Top creators
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
