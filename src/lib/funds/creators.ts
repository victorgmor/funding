import type { FundPerformance } from "@/lib/funds/performance";
import type { Fund } from "@/lib/funds/types";

export type TopCreator = {
  id: string;
  name: string;
  verified: boolean;
  bundleCount: number;
  bestRoi: number | null;
};

export function getTopCreators(
  funds: Fund[],
  performanceBySlug: Record<string, FundPerformance | null>,
  limit = 12,
): TopCreator[] {
  const byId = new Map<string, TopCreator>();

  for (const fund of funds) {
    const roi = performanceBySlug[fund.slug]?.roi ?? null;
    const existing = byId.get(fund.manager.id);

    if (!existing) {
      byId.set(fund.manager.id, {
        id: fund.manager.id,
        name: fund.manager.name,
        verified: fund.manager.verified,
        bundleCount: 1,
        bestRoi: roi,
      });
      continue;
    }

    existing.bundleCount += 1;
    if (roi != null && (existing.bestRoi == null || roi > existing.bestRoi)) {
      existing.bestRoi = roi;
    }
  }

  return [...byId.values()]
    .sort((a, b) => {
      const roiA = a.bestRoi ?? -Infinity;
      const roiB = b.bestRoi ?? -Infinity;
      if (roiB !== roiA) return roiB - roiA;
      return b.bundleCount - a.bundleCount;
    })
    .slice(0, limit);
}
