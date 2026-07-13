import type {
  Fund,
  Mandate,
  MandatePosition,
  MandateTrade,
  ManagerInstruction,
} from "@/lib/funds/types";
import type { FundSettlement } from "@/lib/funds/settlement";

const DAY = 86_400_000;
const now = Date.now();

export const DEMO_MANAGER =
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const;
export const DEMO_INVESTOR =
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as const;

/** User-created funds persisted in demo memory (not the static seed list). */
export const demoUserFunds: Fund[] = [
  {
    id: "demo-1",
    slug: "election-volatility",
    name: "Election Volatility",
    description: "Swing-state polling dislocations into November.",
    thesis:
      "Markets overreact to daily poll noise. This pool trades mean-reversion on battleground states with tight risk caps per event.",
    status: "trading",
    manager: {
      id: DEMO_MANAGER,
      name: "victorgmor",
      verified: true,
    },
    createdAt: new Date(now - 12 * DAY).toISOString(),
    capUsdc: 15_000,
    managerProfitSharePct: 15,
    raiseEndsAt: new Date(now - 5 * DAY).toISOString(),
    tradingEndsAt: new Date(now + 45 * DAY).toISOString(),
  },
  {
    id: "demo-2",
    slug: "rates-soft-landing",
    name: "Rates Soft Landing",
    description: "Macro pool on Fed cut timing vs sticky inflation.",
    thesis:
      "Fed cuts lag market pricing. Pool runs a barbell of cut timing vs sticky inflation prints through Q3.",
    status: "trading",
    manager: {
      id: DEMO_MANAGER,
      name: "victorgmor",
      verified: true,
    },
    createdAt: new Date(now - 20 * DAY).toISOString(),
    capUsdc: 15_000,
    managerProfitSharePct: 10,
    raiseEndsAt: new Date(now + 14 * DAY).toISOString(),
    tradingEndsAt: new Date(now + 90 * DAY).toISOString(),
  },
  {
    id: "demo-3",
    slug: "march-madness-upsets",
    name: "March Madness Upsets",
    description: "Closed pool that faded seeded favorites in the tournament.",
    thesis:
      "Public money overprices favorites in single-elimination formats. Pool faded short favorites round by round and closed after the final.",
    status: "closed",
    manager: {
      id: DEMO_MANAGER,
      name: "victorgmor",
      verified: true,
    },
    createdAt: new Date(now - 90 * DAY).toISOString(),
    capUsdc: 10_000,
    managerProfitSharePct: 12,
    raiseEndsAt: new Date(now - 75 * DAY).toISOString(),
    tradingEndsAt: new Date(now - 30 * DAY).toISOString(),
    closedAt: new Date(now - 30 * DAY).toISOString(),
  },
];

export const demoMandates: Mandate[] = [
  {
    id: "mandate-1",
    fundSlug: "nothing-ever-happens",
    investorWallet: DEMO_INVESTOR,
    notionalUsdc: 12_500,
    cashUsdc: 4_200,
    status: "active",
    createdAt: new Date(now - 8 * DAY).toISOString(),
    updatedAt: new Date(now - 1 * DAY).toISOString(),
  },
  {
    id: "mandate-2",
    fundSlug: "nothing-ever-happens",
    investorWallet: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    notionalUsdc: 12_500,
    cashUsdc: 4_200,
    status: "active",
    createdAt: new Date(now - 6 * DAY).toISOString(),
    updatedAt: new Date(now - 2 * DAY).toISOString(),
  },
  {
    id: "mandate-3",
    fundSlug: "election-volatility",
    investorWallet: DEMO_INVESTOR,
    notionalUsdc: 12_340,
    cashUsdc: 4_200,
    status: "active",
    createdAt: new Date(now - 4 * DAY).toISOString(),
    updatedAt: new Date(now - 1 * DAY).toISOString(),
  },
  {
    id: "mandate-4",
    fundSlug: "btc-etf-flows",
    investorWallet: DEMO_INVESTOR,
    notionalUsdc: 8_200,
    cashUsdc: 2_100,
    status: "active",
    createdAt: new Date(now - 7 * DAY).toISOString(),
    updatedAt: new Date(now - 2 * DAY).toISOString(),
  },
  {
    id: "mandate-5",
    fundSlug: "fed-sep-meeting",
    investorWallet: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    notionalUsdc: 6_500,
    cashUsdc: 6_500,
    status: "active",
    createdAt: new Date(now - 5 * DAY).toISOString(),
    updatedAt: new Date(now - 1 * DAY).toISOString(),
  },
  {
    id: "mandate-6",
    fundSlug: "hurricane-season",
    investorWallet: DEMO_INVESTOR,
    notionalUsdc: 4_800,
    cashUsdc: 1_200,
    status: "active",
    createdAt: new Date(now - 10 * DAY).toISOString(),
    updatedAt: new Date(now - 3 * DAY).toISOString(),
  },
  {
    id: "mandate-7",
    fundSlug: "oscars-best-picture",
    investorWallet: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
    notionalUsdc: 3_400,
    cashUsdc: 900,
    status: "active",
    createdAt: new Date(now - 6 * DAY).toISOString(),
    updatedAt: new Date(now - 2 * DAY).toISOString(),
  },
  {
    id: "mandate-8",
    fundSlug: "oil-supply-shocks",
    investorWallet: DEMO_INVESTOR,
    notionalUsdc: 5_600,
    cashUsdc: 5_600,
    status: "active",
    createdAt: new Date(now - 8 * DAY).toISOString(),
    updatedAt: new Date(now - 1 * DAY).toISOString(),
  },
];

export const demoInstructions: ManagerInstruction[] = [
  {
    id: "instr-1",
    fundSlug: "nothing-ever-happens",
    managerWallet: "m1",
    tokenId: "12345",
    question: "Will GTA VI release before June 2026?",
    side: "no",
    totalUsdc: 18_000,
    price: 0.62,
    shares: 29_032.3,
    status: "executed",
    createdAt: new Date(now - 3 * DAY).toISOString(),
    executedAt: new Date(now - 3 * DAY).toISOString(),
  },
  {
    id: "instr-2",
    fundSlug: "election-volatility",
    managerWallet: DEMO_MANAGER,
    tokenId: "67890",
    question: "Will Pennsylvania flip in 2026 midterms?",
    side: "yes",
    totalUsdc: 9_500,
    price: 0.41,
    shares: 23_170.7,
    status: "executed",
    createdAt: new Date(now - 1 * DAY).toISOString(),
    executedAt: new Date(now - 1 * DAY).toISOString(),
  },
];

export const demoTrades: MandateTrade[] = [
  {
    id: "trade-1",
    mandateId: "mandate-1",
    instructionId: "instr-1",
    fundSlug: "nothing-ever-happens",
    investorWallet: DEMO_INVESTOR,
    tokenId: "12345",
    question: "Will GTA VI release before June 2026?",
    side: "no",
    usdcAmount: 5_200,
    price: 0.62,
    shares: 8_387.1,
    status: "filled",
    createdAt: new Date(now - 3 * DAY).toISOString(),
    filledAt: new Date(now - 3 * DAY).toISOString(),
  },
  {
    id: "trade-2",
    mandateId: "mandate-3",
    instructionId: "instr-2",
    fundSlug: "election-volatility",
    investorWallet: DEMO_INVESTOR,
    tokenId: "67890",
    question: "Will Pennsylvania flip in 2026 midterms?",
    side: "yes",
    usdcAmount: 4_800,
    price: 0.41,
    shares: 11_707.3,
    status: "filled",
    createdAt: new Date(now - 1 * DAY).toISOString(),
    filledAt: new Date(now - 1 * DAY).toISOString(),
  },
];

export const demoPositions: MandatePosition[] = [
  {
    id: "mandate-1#12345",
    mandateId: "mandate-1",
    fundSlug: "nothing-ever-happens",
    investorWallet: DEMO_INVESTOR,
    tokenId: "12345",
    question: "Will GTA VI release before June 2026?",
    side: "no",
    shares: 8_387.1,
    avgPrice: 0.62,
    costUsdc: 5_200,
    updatedAt: new Date(now - 3 * DAY).toISOString(),
  },
  {
    id: "mandate-3#67890",
    mandateId: "mandate-3",
    fundSlug: "election-volatility",
    investorWallet: DEMO_INVESTOR,
    tokenId: "67890",
    question: "Will Pennsylvania flip in 2026 midterms?",
    side: "yes",
    shares: 11_707.3,
    avgPrice: 0.41,
    costUsdc: 4_800,
    updatedAt: new Date(now - 1 * DAY).toISOString(),
  },
];

export const demoSettlements: Record<string, FundSettlement> = {};

/** Mark prices for demo positions — above avg cost so mandates show profit. */
export const demoMidPrices: Record<string, number> = {
  "12345": 0.71,
  "67890": 0.52,
};
