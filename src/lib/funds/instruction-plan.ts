import { fanoutSell, fanoutTrade } from "@/lib/funds/fanout";
import type {
  FanoutSlice,
  Mandate,
  MandatePosition,
  MarketSide,
  OrderSide,
} from "@/lib/funds/types";
import {
  fetchGammaMarket,
  fetchMarkPriceByTokenId,
  midPrice,
  outcomeIndex,
  parseOutcomes,
  tokenIdForSide,
} from "@/lib/polymarket/gamma";

export type TradeDraft = {
  gammaMarketId?: string;
  /** Required for sells when skipping market search. */
  tokenId?: string;
  side: MarketSide;
  totalUsdc: number;
  /** Optional limit price (0.01–0.99). Defaults to market mid when omitted. */
  price?: number;
  orderSide?: OrderSide;
};

export type PlannedTrade = {
  gammaMarketId?: string;
  totalUsdc: number;
  price: number;
  tokenId: string;
  question: string;
  side: MarketSide;
  orderSide: OrderSide;
  slices: FanoutSlice[];
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function applyBuySlices(mandates: Mandate[], slices: FanoutSlice[]): Mandate[] {
  const byId = new Map(mandates.map((m) => [m.id, { ...m }]));
  for (const slice of slices) {
    const mandate = byId.get(slice.mandateId);
    if (!mandate) continue;
    mandate.cashUsdc = round(mandate.cashUsdc - slice.usdcAmount, 2);
  }
  return [...byId.values()];
}

function applySellSlices(
  positions: MandatePosition[],
  tokenId: string,
  slices: FanoutSlice[],
): MandatePosition[] {
  const byKey = new Map(
    positions.map((pos) => [`${pos.mandateId}#${pos.tokenId}`, { ...pos }]),
  );
  for (const slice of slices) {
    const key = `${slice.mandateId}#${tokenId}`;
    const pos = byKey.get(key);
    if (!pos) continue;
    pos.shares = round(Math.max(0, pos.shares - slice.shares), 4);
    byKey.set(key, pos);
  }
  return [...byKey.values()];
}

export async function planTradeBatch(
  drafts: TradeDraft[],
  mandates: Mandate[],
  positions: MandatePosition[] = [],
): Promise<PlannedTrade[]> {
  if (drafts.length === 0) throw new Error("At least one trade required");

  let workingMandates = mandates.map((m) => ({ ...m }));
  let workingPositions = positions.map((p) => ({ ...p }));
  const planned: PlannedTrade[] = [];

  for (const draft of drafts) {
    const orderSide: OrderSide = draft.orderSide === "SELL" ? "SELL" : "BUY";
    const totalUsdc = Number(draft.totalUsdc);
    if (!totalUsdc || totalUsdc < 1) {
      throw new Error("Trade amount required");
    }

    if (orderSide === "SELL") {
      const tokenId = draft.tokenId?.trim();
      if (!tokenId) throw new Error("Position required to sell");

      const open = workingPositions.filter(
        (pos) => pos.tokenId === tokenId && !pos.redeemedAt && pos.shares > 0,
      );
      if (open.length === 0) throw new Error("No open shares to sell");

      const mark = await fetchMarkPriceByTokenId(tokenId, {
        question: open[0]?.question,
        side: open[0]?.side,
      });
      const price = Math.min(0.99, Math.max(0.01, mark ?? open[0]!.avgPrice));
      const slices = fanoutSell(totalUsdc, price, open);

      planned.push({
        totalUsdc,
        price,
        tokenId,
        question: open[0]!.question,
        side: open[0]!.side,
        orderSide,
        slices,
      });
      workingPositions = applySellSlices(workingPositions, tokenId, slices);
      continue;
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
    const override =
      draft.price != null && Number.isFinite(Number(draft.price))
        ? Number(draft.price)
        : null;
    const price = Math.min(
      0.99,
      Math.max(
        0.01,
        override != null && override >= 0.01 && override <= 0.99
          ? override
          : midPrice(gamma, canonicalSide),
      ),
    );
    const tokenId = tokenIdForSide(
      gamma.clobTokenIds,
      gamma.outcomes,
      canonicalSide,
    );
    const slices = fanoutTrade(totalUsdc, price, workingMandates);

    planned.push({
      gammaMarketId: draft.gammaMarketId,
      totalUsdc,
      price,
      tokenId,
      question: gamma.question,
      side: canonicalSide,
      orderSide,
      slices,
    });

    workingMandates = applyBuySlices(workingMandates, slices);
  }

  return planned;
}
