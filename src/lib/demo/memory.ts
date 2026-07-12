import type { StoredChallenge } from "@/lib/auth/challenge-store";
import type { FundSettlement } from "@/lib/funds/settlement";
import type {
  Fund,
  Mandate,
  MandatePosition,
  MandateTrade,
  ManagerInstruction,
} from "@/lib/funds/types";
import {
  demoInstructions,
  demoMandates,
  demoMidPrices,
  demoPositions,
  demoSettlements,
  demoTrades,
  demoUserFunds,
} from "@/lib/demo/seed";

let ready = false;

export const demoMemory = {
  funds: new Map<string, Fund>(),
  mandates: new Map<string, Mandate>(),
  instructions: new Map<string, ManagerInstruction>(),
  trades: new Map<string, MandateTrade>(),
  positions: new Map<string, MandatePosition>(),
  sessions: new Map<string, string>(),
  settlements: new Map<string, FundSettlement>(),
  challenges: new Map<string, StoredChallenge>(),
  mids: new Map<string, number>(),
};

export function ensureDemoMemory() {
  if (ready) return;
  if (!process.env._DEMO_LOGGED) {
    console.info("[carriera] Demo mode — using in-memory storage (no AWS DynamoDB)");
    process.env._DEMO_LOGGED = "1";
  }
  ready = true;

  for (const fund of demoUserFunds) {
    demoMemory.funds.set(fund.slug, structuredClone(fund));
  }
  for (const row of demoMandates) {
    demoMemory.mandates.set(`${row.fundSlug}#${row.investorWallet}`, structuredClone(row));
  }
  for (const row of demoInstructions) {
    demoMemory.instructions.set(row.id, structuredClone(row));
  }
  for (const row of demoTrades) {
    demoMemory.trades.set(row.id, structuredClone(row));
  }
  for (const row of demoPositions) {
    demoMemory.positions.set(row.id, structuredClone(row));
  }
  for (const [slug, settlement] of Object.entries(demoSettlements)) {
    demoMemory.settlements.set(slug, structuredClone(settlement));
  }
  for (const [tokenId, mid] of Object.entries(demoMidPrices)) {
    demoMemory.mids.set(tokenId, mid);
  }
}

/**
 * Demo mode only — seed mandates for whichever wallet connects locally so
 * "Your mandates" and fund pages have data without committing capital.
 */
export function ensureDemoWalletMandates(wallet: string) {
  ensureDemoMemory();
  const w = wallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return;

  const seeded = [...demoMemory.mandates.values()].some(
    (m) => m.investorWallet === w,
  );
  if (seeded) return;

  const now = Date.now();
  const specs = [
    {
      fundSlug: "election-volatility",
      notionalUsdc: 12_000,
      cashUsdc: 3_400,
      createdDaysAgo: 6,
    },
    {
      fundSlug: "nothing-ever-happens",
      notionalUsdc: 5_500,
      cashUsdc: 5_500,
      createdDaysAgo: 2,
    },
    {
      fundSlug: "march-madness-upsets",
      notionalUsdc: 3_000,
      cashUsdc: 3_000,
      createdDaysAgo: 80,
    },
  ];

  for (const spec of specs) {
    const mandate: Mandate = {
      id: `demo-${spec.fundSlug}-${w.slice(2, 10)}`,
      fundSlug: spec.fundSlug,
      investorWallet: w,
      notionalUsdc: spec.notionalUsdc,
      cashUsdc: spec.cashUsdc,
      status: "active",
      createdAt: new Date(now - spec.createdDaysAgo * 86_400_000).toISOString(),
      updatedAt: new Date(now - 3_600_000).toISOString(),
    };
    demoMemory.mandates.set(`${mandate.fundSlug}#${w}`, mandate);
  }

  // Deployed capital sits in a position so mark-to-market profit shows up.
  const position: MandatePosition = {
    id: `demo-election-volatility-${w.slice(2, 10)}#67890`,
    mandateId: `demo-election-volatility-${w.slice(2, 10)}`,
    fundSlug: "election-volatility",
    investorWallet: w,
    tokenId: "67890",
    question: "Will Pennsylvania flip in 2026 midterms?",
    side: "yes",
    shares: 20_975.61,
    avgPrice: 0.41,
    costUsdc: 8_600,
    updatedAt: new Date(now - 3_600_000).toISOString(),
  };
  demoMemory.positions.set(position.id, position);
}
