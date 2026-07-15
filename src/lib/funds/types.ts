export type FundStatus = "trading" | "closed";
export type MandateStatus = "active" | "redeeming" | "closed";
export type InstructionStatus =
  | "pending"
  | "executing"
  | "executed"
  | "failed"
  | "cancelled";
export type MandateTradeStatus =
  | "pending"
  | "executing"
  | "filled"
  | "failed"
  | "skipped";
export type MarketSide = string;

export type FundManager = {
  id: string;
  name: string;
  verified: boolean;
};

export type Fund = {
  id: string;
  slug: string;
  name: string;
  description: string;
  thesis: string;
  status: FundStatus;
  manager: FundManager;
  createdAt?: string;
  /** ISO — last day manager may open new risk */
  tradingEndsAt?: string | null;
  /** ISO — last day new mandates accepted */
  raiseEndsAt?: string | null;
  /** ISO — when the fund was closed (manual or effective) */
  closedAt?: string | null;
  /** Max virtual pool size in USDC */
  capUsdc?: number | null;
  /** Manager share of mandate profits on close (0–50) */
  managerProfitSharePct?: number;
  /** @deprecated legacy field — ignored */
  fundValue?: number;
  deposited?: number;
  cap?: number | null;
  investors?: number;
  maxInvestors?: number;
  polymarketUrl?: string;
};

export type OrderLeg = {
  tokenId: string;
  question: string;
  side: MarketSide;
  usdcAmount: number;
  price: number;
  shares: number;
  weight?: number;
};

export type BasketQuote = {
  fundSlug: string;
  totalUsdc: number;
  legs: OrderLeg[];
};

export type Mandate = {
  id: string;
  fundSlug: string;
  investorWallet: string;
  notionalUsdc: number;
  cashUsdc: number;
  status: MandateStatus;
  createdAt: string;
  updatedAt: string;
};

export type ManagerInstruction = {
  id: string;
  fundSlug: string;
  tokenId: string;
  question: string;
  side: MarketSide;
  totalUsdc: number;
  price: number;
  shares: number;
  status: InstructionStatus;
  createdAt: string;
  executedAt?: string;
  managerWallet: string;
};

export type MandateTrade = {
  id: string;
  mandateId: string;
  instructionId: string;
  fundSlug: string;
  investorWallet: string;
  tokenId: string;
  question: string;
  side: MarketSide;
  usdcAmount: number;
  price: number;
  shares: number;
  status: MandateTradeStatus;
  createdAt: string;
  filledAt?: string;
  detail?: string;
  /** Mark-to-market PnL when settlement/live price is known (API only). */
  pnlUsdc?: number | null;
};

export type FanoutSlice = {
  mandateId: string;
  investorWallet: string;
  usdcAmount: number;
  price: number;
  shares: number;
  poolShare: number;
};

export type MandatePosition = {
  id: string;
  mandateId: string;
  fundSlug: string;
  investorWallet: string;
  tokenId: string;
  question: string;
  side: MarketSide;
  shares: number;
  avgPrice: number;
  costUsdc: number;
  updatedAt: string;
  /** Set after on-chain redemption — hidden from active positions. */
  redeemedAt?: string;
};

export type TradingSession = {
  fundSlug: string;
  investorWallet: string;
  depositAddress: string;
  signatureType: number;
  authorized: boolean;
  /** Privy session signer registered for server-side order signing */
  serverSigner?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VirtualPool = {
  fundSlug: string;
  totalNotional: number;
  totalCash: number;
  mandateCount: number;
  mandates: Mandate[];
  recentInstructions: ManagerInstruction[];
  recentTrades: MandateTrade[];
  positions?: MandatePosition[];
};

export type LegResult = {
  question: string;
  status: "filled" | "failed";
  detail?: string;
};
