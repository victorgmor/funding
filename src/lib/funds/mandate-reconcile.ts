import {
  adjustMandateCash,
  listMandatesByFund,
  saveMandateRecord,
} from "@/lib/funds/mandates";
import {
  deletePositionsForMandate,
  listAllPositionsByMandate,
  listPositionsByMandate,
  listPositionsByWallet,
  savePositionRecord,
} from "@/lib/funds/mandate-positions";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import type { Mandate, MandatePosition, MandateTrade } from "@/lib/funds/types";
import { tradePnlUsdc } from "@/lib/funds/valuation";
import { readInvestorCollateralUsdc } from "@/lib/polymarket/deposit-balance";
import type { Address } from "viem";

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function mergeTrade(
  existing: MandatePosition | undefined,
  trade: MandateTrade,
  now: string,
): MandatePosition {
  if (!existing) {
    return {
      id: `${trade.mandateId}#${trade.tokenId}`,
      mandateId: trade.mandateId,
      fundSlug: trade.fundSlug,
      investorWallet: trade.investorWallet,
      tokenId: trade.tokenId,
      question: trade.question,
      side: trade.side,
      shares: round(trade.shares, 4),
      avgPrice: round(trade.price, 4),
      costUsdc: round(trade.usdcAmount, 2),
      updatedAt: now,
    };
  }

  const costUsdc = round(existing.costUsdc + trade.usdcAmount, 2);
  const shares = round(existing.shares + trade.shares, 4);
  return {
    ...existing,
    question: trade.question,
    side: trade.side,
    shares,
    avgPrice: shares > 0 ? round(costUsdc / shares, 4) : existing.avgPrice,
    costUsdc,
    updatedAt: now,
  };
}

/** Rebuild mandate positions from filled trades when ledger drifted. */
export async function reconcileMandatePositions(
  fundSlug: string,
  mandateId: string,
): Promise<MandatePosition[]> {
  const existing = await listPositionsByMandate(fundSlug, mandateId);
  const redeemedTokens = new Set(
    (await listAllPositionsByMandate(fundSlug, mandateId))
      .filter((pos) => pos.redeemedAt)
      .map((pos) => pos.tokenId),
  );
  const trades = (await listTradesByFund(fundSlug)).filter(
    (trade) =>
      trade.mandateId === mandateId &&
      trade.status === "filled" &&
      !redeemedTokens.has(trade.tokenId),
  );
  const now = new Date().toISOString();

  const rebuilt = new Map<string, MandatePosition>();
  for (const trade of trades) {
    const current = rebuilt.get(trade.tokenId);
    rebuilt.set(trade.tokenId, mergeTrade(current, trade, now));
  }

  const expected = [...rebuilt.values()];
  const matches =
    existing.length === expected.length &&
    existing.every((pos) => {
      const next = rebuilt.get(pos.tokenId);
      return (
        next &&
        next.shares === pos.shares &&
        next.costUsdc === pos.costUsdc
      );
    });

  if (matches) return existing;

  await deletePositionsForMandate(fundSlug, mandateId);
  for (const position of expected) {
    await savePositionRecord(position);
  }

  return expected;
}

export function expectedMandateCash(
  mandate: Mandate,
  positions: MandatePosition[],
): number {
  const deployed = positions
    .filter(
      (pos) =>
        pos.mandateId === mandate.id && !pos.redeemedAt && pos.shares > 0,
    )
    .reduce((sum, pos) => sum + pos.costUsdc, 0);
  return Math.max(0, round(mandate.notionalUsdc - deployed, 2));
}

/**
 * deposited = external capital (immutable once set);
 * notional = deposited + realized; cash = notional − open cost.
 */
export function rebuildMandateBooks(
  mandate: Mandate,
  openPositions: MandatePosition[],
  filledTrades: MandateTrade[],
  valuations: Map<string, number>,
): Mandate {
  const open = openPositions.filter(
    (pos) =>
      pos.mandateId === mandate.id && !pos.redeemedAt && pos.shares > 0,
  );
  const openTokens = new Set(open.map((pos) => pos.tokenId));
  const openCost = round(
    open.reduce((sum, pos) => sum + pos.costUsdc, 0),
    2,
  );

  let realizedPnl = 0;
  for (const trade of filledTrades) {
    if (trade.mandateId !== mandate.id || trade.status !== "filled") continue;
    if (openTokens.has(trade.tokenId)) continue;
    const pnl = tradePnlUsdc(trade, valuations);
    if (pnl != null) realizedPnl = round(realizedPnl + pnl, 2);
  }

  // Never rewrite deposited — commits own this field.
  const deposited =
    mandate.depositedUsdc ??
    round(Math.max(0, mandate.notionalUsdc - realizedPnl), 2);

  const notionalUsdc = round(Math.max(0, deposited + realizedPnl), 2);
  const cashUsdc = round(Math.max(0, notionalUsdc - openCost), 2);

  return {
    ...mandate,
    depositedUsdc: round(deposited, 2),
    notionalUsdc,
    cashUsdc,
    updatedAt: new Date().toISOString(),
  };
}

/** Liquid deposit wallet + open position cost for mandate backing checks. */
export async function investorMandateBacking(
  fundSlug: string,
  investorWallet: string,
  mandateId?: string,
): Promise<{ liquidUsdc: number; deployedUsdc: number; totalUsdc: number }> {
  const liquidUsdc = await readInvestorCollateralUsdc(
    investorWallet as Address,
  );
  let positions = await listPositionsByWallet(fundSlug, investorWallet);
  if (mandateId) {
    positions = positions.filter((pos) => pos.mandateId === mandateId);
  }
  const deployedUsdc = round(
    positions.reduce((sum, pos) => sum + pos.costUsdc, 0),
    2,
  );
  return {
    liquidUsdc,
    deployedUsdc,
    totalUsdc: round(liquidUsdc + deployedUsdc, 2),
  };
}

export async function reconcileMandateCash(
  fundSlug: string,
  mandate: Mandate,
  positions: MandatePosition[],
  filledTrades: MandateTrade[] = [],
  valuations: Map<string, number> = new Map(),
  depositAddress?: string,
): Promise<Mandate> {
  const open = positions.filter(
    (pos) =>
      pos.mandateId === mandate.id && !pos.redeemedAt && pos.shares > 0,
  );

  // Always try live books — Dynamo depositedUsdc may be corrupted.
  {
    const { healMandateFromLive, liveMandateBooks } = await import(
      "@/lib/funds/live-mandate"
    );
    const live = await liveMandateBooks(
      mandate,
      filledTrades,
      depositAddress,
      valuations,
    );
    if (live && (live.deployableUsdc > 0 || live.depositedUsdc > 0)) {
      return healMandateFromLive(mandate, live);
    }
  }

  if (filledTrades.length > 0 || valuations.size > 0) {
    const rebuilt = rebuildMandateBooks(
      mandate,
      open,
      filledTrades,
      valuations,
    );
    if (
      rebuilt.depositedUsdc !== mandate.depositedUsdc ||
      rebuilt.notionalUsdc !== mandate.notionalUsdc ||
      Math.abs(rebuilt.cashUsdc - mandate.cashUsdc) >= 0.01
    ) {
      await saveMandateRecord(rebuilt);
      return rebuilt;
    }
  }

  const expected = expectedMandateCash(mandate, open);
  const delta = round(expected - mandate.cashUsdc, 2);
  if (Math.abs(delta) < 0.01) return mandate;

  try {
    const updated = await adjustMandateCash(mandate.id, fundSlug, delta);
    return updated ?? mandate;
  } catch {
    return mandate;
  }
}

/** Heal drifted cash and positions for every mandate in a fund. */
export async function reconcileFundMandates(fundSlug: string): Promise<Mandate[]> {
  const mandates = await listMandatesByFund(fundSlug);
  const allTrades = (await listTradesByFund(fundSlug)).filter(
    (trade) => trade.status === "filled",
  );

  const { fetchTokenValuations, resolveDepositAddresses } = await import(
    "@/lib/funds/valuation"
  );
  const depositByInvestor = await resolveDepositAddresses(
    fundSlug,
    mandates.map((m) => m.investorWallet),
  );
  const positions = (
    await Promise.all(
      mandates.map((m) => listAllPositionsByMandate(fundSlug, m.id)),
    )
  ).flat();
  const valuations = await fetchTokenValuations(
    positions,
    depositByInvestor,
    allTrades,
  );

  const reconciled: Mandate[] = [];

  for (const mandate of mandates) {
    const openPositions = await reconcileMandatePositions(fundSlug, mandate.id);
    reconciled.push(
      await reconcileMandateCash(
        fundSlug,
        mandate,
        openPositions,
        allTrades,
        valuations,
        depositByInvestor.get(mandate.investorWallet),
      ),
    );
  }

  return reconciled;
}
