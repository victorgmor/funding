import { fanoutTrade } from "@/lib/funds/fanout";
import type { FanoutSlice, Mandate, MarketSide } from "@/lib/funds/types";
import {
  fetchGammaMarket,
  midPrice,
  outcomeIndex,
  parseOutcomes,
  tokenIdForSide,
} from "@/lib/polymarket/gamma";

export type TradeDraft = {
  gammaMarketId: string;
  side: MarketSide;
  totalUsdc: number;
};

export type PlannedTrade = {
  gammaMarketId: string;
  totalUsdc: number;
  price: number;
  tokenId: string;
  question: string;
  side: MarketSide;
  slices: FanoutSlice[];
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function applySlices(mandates: Mandate[], slices: FanoutSlice[]): Mandate[] {
  const byId = new Map(mandates.map((m) => [m.id, { ...m }]));
  for (const slice of slices) {
    const mandate = byId.get(slice.mandateId);
    if (!mandate) continue;
    mandate.cashUsdc = round(mandate.cashUsdc - slice.usdcAmount, 2);
  }
  return [...byId.values()];
}

export async function planTradeBatch(
  drafts: TradeDraft[],
  mandates: Mandate[],
): Promise<PlannedTrade[]> {
  if (drafts.length === 0) throw new Error("At least one trade required");

  let working = mandates.map((m) => ({ ...m }));
  const planned: PlannedTrade[] = [];

  for (const draft of drafts) {
    const totalUsdc = Number(draft.totalUsdc);
    if (!totalUsdc || totalUsdc < 1) {
      throw new Error("Trade amount required");
    }
    if (!draft.gammaMarketId) throw new Error("Market required");

    const gamma = await fetchGammaMarket(draft.gammaMarketId);
    const outcomes = parseOutcomes(gamma.outcomes);
    const side = draft.side?.trim() ?? "";
    if (!side || outcomeIndex(outcomes, side) === -1) {
      throw new Error(
        `Outcome must be one of: ${outcomes.join(", ")} (${gamma.question})`,
      );
    }

    const canonicalSide = outcomes[outcomeIndex(outcomes, side)]!;
    const price = Math.min(0.99, Math.max(0.01, midPrice(gamma, canonicalSide)));
    const tokenId = tokenIdForSide(gamma.clobTokenIds, gamma.outcomes, canonicalSide);
    const slices = fanoutTrade(totalUsdc, price, working);

    planned.push({
      gammaMarketId: draft.gammaMarketId,
      totalUsdc,
      price,
      tokenId,
      question: gamma.question,
      side: canonicalSide,
      slices,
    });

    working = applySlices(working, slices);
  }

  return planned;
}
