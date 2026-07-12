import type { Fund } from "@/lib/funds/types";

export const seedFunds: Fund[] = [
  {
    id: "1",
    slug: "nothing-ever-happens",
    name: "Nothing Ever Happens",
    description: "Discretionary NO-on-hype macro pool.",
    thesis:
      "Nothing ever happens. A managed pool for contrarian Polymarket positions — manager trades discretionarily with proportional fan-out.",
    status: "trading",
    manager: { id: "m1", name: "45degrees", verified: true },
    createdAt: "2025-05-02T15:48:10.582Z",
    polymarketUrl: "https://polymarket.com/event/what-will-happen-before-gta-vi",
  },
  {
    id: "2",
    slug: "rate-cut-q3",
    name: "Rate Cut Q3",
    description: "Fed cuts at least once before October.",
    thesis: "Soft landing narrative wins. Macro pool skewed toward Q3 cut exposure.",
    status: "trading",
    manager: { id: "m2", name: "macro_lab", verified: true },
    createdAt: "2025-05-02T15:48:10.582Z",
  },
];

/** @deprecated use getFund from @/lib/funds/store */
export function getFund(slug: string): Fund | undefined {
  return seedFunds.find((fund) => fund.slug === slug);
}
