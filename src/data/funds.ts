import type { Fund } from "@/lib/funds/types";

// Real Polymarket markets (GTA VI basket — bet NO on hype). Token IDs are NO outcome.
export const seedFunds: Fund[] = [
  {
    id: "1",
    slug: "nothing-ever-happens",
    name: "Nothing Ever Happens",
    description: "Nothing happens before GTA VI. All NO.",
    thesis:
      "Nothing ever happens. This fund buys NO on a basket of Polymarket markets asking what will happen before GTA VI.",
    status: "trading",
    manager: { id: "m1", name: "45degrees", verified: true },
    createdAt: "2025-05-02T15:48:10.582Z",
    markets: [
      {
        gammaMarketId: "540817",
        conditionId:
          "0x1fad72fae204143ff1c3035e99e7c0f65ea8d5cd9bd1070987bd1a3316f772be",
        tokenId:
          "53831553061883006530739877284105938919721408776239639687877978808906551086026",
        question: "New Rihanna Album before GTA VI?",
        side: "no",
        weight: 34,
        entryPrice: 0.445,
      },
      {
        gammaMarketId: "540818",
        conditionId:
          "0x50ddb9cd80d5c271664a2ebb7fcaed1d0a148d82c8e8d314d830f75a944c3dcc",
        tokenId:
          "94376205816022955542979635542279932967359915765455578534002478996104754801969",
        question: "New Playboi Carti Album before GTA VI?",
        side: "no",
        weight: 33,
        entryPrice: 0.445,
      },
      {
        gammaMarketId: "540819",
        conditionId:
          "0x32b09f6390252b37d674501527e709016d55581b2c1e544bd4b8167f5f732f4c",
        tokenId:
          "92388629082681805622801622703528982922543286352927708208755887536971583436902",
        question: "Will Jesus Christ return before GTA VI?",
        side: "no",
        weight: 33,
        entryPrice: 0.48,
      },
    ],
    polymarketUrl: "https://polymarket.com/event/what-will-happen-before-gta-vi",
  },
  {
    id: "2",
    slug: "rate-cut-q3",
    name: "Rate Cut Q3",
    description: "Fed cuts at least once before October.",
    thesis: "Soft landing narrative wins. Macro markets skew YES on a Q3 cut.",
    status: "trading",
    manager: { id: "m2", name: "macro_lab", verified: true },
    createdAt: "2025-05-02T15:48:10.582Z",
    markets: [
      {
        gammaMarketId: "540817",
        conditionId:
          "0x1fad72fae204143ff1c3035e99e7c0f65ea8d5cd9bd1070987bd1a3316f772be",
        tokenId:
          "98022490269692409998126496127597032490334070080325855126491859374983463996227",
        question: "New Rihanna Album before GTA VI? (YES leg demo)",
        side: "yes",
        weight: 100,
        entryPrice: 0.555,
      },
    ],
  },
];

/** @deprecated use getFund from @/lib/funds/store */
export function getFund(slug: string): Fund | undefined {
  return seedFunds.find((fund) => fund.slug === slug);
}
