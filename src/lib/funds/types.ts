export type FundStatus = "trading" | "closed";
export type MarketSide = "yes" | "no";

export type MarketPosition = {
  gammaMarketId: string;
  conditionId: string;
  tokenId: string;
  question: string;
  side: MarketSide;
  weight: number;
  /** Outcome price (0–1) for this side when the fund was published */
  entryPrice?: number;
};

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
  markets: MarketPosition[];
  createdAt?: string;
  /** USDC price to unlock bundle access. Omit or 0 for free. */
  unlockPriceUsdc?: number | null;
  /** @deprecated computed live from entry prices — do not set manually */
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
  weight: number;
};

export type BasketQuote = {
  fundSlug: string;
  totalUsdc: number;
  legs: OrderLeg[];
};

export type ExitLeg = {
  tokenId: string;
  question: string;
  side: MarketSide;
  shares: number;
  estUsdc: number;
};

export type ExitQuote = {
  fundSlug: string;
  legs: ExitLeg[];
  totalEstUsdc: number;
};

export type InvestmentLeg = {
  tokenId: string;
  question: string;
  side: MarketSide;
  shares: number;
  investedUsdc: number;
  currentUsdc: number;
};

export type FundInvestment = {
  fundSlug: string;
  totalInvested: number;
  totalCurrent: number;
  legs: InvestmentLeg[];
};
