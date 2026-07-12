import type { Fund } from "@/lib/funds/types";

const DAY = 86_400_000;
const now = Date.now();

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
    capUsdc: 75_000,
    managerProfitSharePct: 12,
    raiseEndsAt: new Date(now - 10 * DAY).toISOString(),
    tradingEndsAt: new Date(now + 60 * DAY).toISOString(),
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
    capUsdc: 200_000,
    raiseEndsAt: new Date(now + 21 * DAY).toISOString(),
    tradingEndsAt: new Date(now + 120 * DAY).toISOString(),
  },
  {
    id: "3",
    slug: "spring-cpi-prints",
    name: "Spring CPI Prints",
    description: "Closed macro pool on Q1–Q2 inflation prints.",
    thesis:
      "Sticky-inflation prints were mispriced through spring. Pool traded monthly CPI markets and wound down after the June print.",
    status: "closed",
    manager: { id: "m2", name: "macro_lab", verified: true },
    createdAt: new Date(now - 120 * DAY).toISOString(),
    capUsdc: 50_000,
    managerProfitSharePct: 10,
    raiseEndsAt: new Date(now - 100 * DAY).toISOString(),
    tradingEndsAt: new Date(now - 20 * DAY).toISOString(),
    closedAt: new Date(now - 20 * DAY).toISOString(),
  },
];

/** @deprecated use getFund from @/lib/funds/store */
export function getFund(slug: string): Fund | undefined {
  return seedFunds.find((fund) => fund.slug === slug);
}
