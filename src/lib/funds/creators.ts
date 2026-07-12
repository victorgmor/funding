import type { Fund } from "@/lib/funds/types";

export type TopCreator = {
  id: string;
  name: string;
  verified: boolean;
  fundCount: number;
};

export function getTopCreators(funds: Fund[], limit = 12): TopCreator[] {
  const byId = new Map<string, TopCreator>();

  for (const fund of funds) {
    const existing = byId.get(fund.manager.id);

    if (!existing) {
      byId.set(fund.manager.id, {
        id: fund.manager.id,
        name: fund.manager.name,
        verified: fund.manager.verified,
        fundCount: 1,
      });
      continue;
    }

    existing.fundCount += 1;
  }

  return [...byId.values()]
    .sort((a, b) => {
      if (b.fundCount !== a.fundCount) return b.fundCount - a.fundCount;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}
