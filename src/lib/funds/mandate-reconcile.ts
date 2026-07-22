import { adjustMandateCash, listMandatesByFund, saveMandateRecord } from "@/lib/funds/mandates";
import {
  deletePositionsForMandate,
  listAllPositionsByMandate,
  listPositionsByMandate,
  listPositionsByWallet,
  savePositionRecord,
} from "@/lib/funds/mandate-positions";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import type { Mandate, MandatePosition, MandateTrade } from "@/lib/funds/types";
import { readDepositWalletBalanceUsdc } from "@/lib/polymarket/deposit-balance";
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
    .filter((pos) => pos.mandateId === mandate.id)
    .reduce((sum, pos) => sum + pos.costUsdc, 0);
  return Math.max(0, round(mandate.notionalUsdc - deployed, 2));
}

/** Liquid deposit wallet + open position cost for mandate backing checks. */
export async function investorMandateBacking(
  fundSlug: string,
  investorWallet: string,
  mandateId?: string,
): Promise<{ liquidUsdc: number; deployedUsdc: number; totalUsdc: number }> {
  const liquidUsdc = await readDepositWalletBalanceUsdc(
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
): Promise<Mandate> {
  let current = mandate;
  const open = positions.filter(
    (pos) => pos.mandateId === mandate.id && !pos.redeemedAt && pos.shares > 0,
  );

  // Heal older mandates: pin depositedUsdc, fold idle redeem cash into notional.
  const depositedUsdc = current.depositedUsdc ?? current.notionalUsdc;
  const notionalUsdc =
    open.length === 0
      ? round(Math.max(current.notionalUsdc, current.cashUsdc), 2)
      : current.notionalUsdc;
  if (
    current.depositedUsdc == null ||
    notionalUsdc !== current.notionalUsdc
  ) {
    current = {
      ...current,
      depositedUsdc,
      notionalUsdc,
      updatedAt: new Date().toISOString(),
    };
    await saveMandateRecord(current);
  }

  const expected = expectedMandateCash(current, positions);
  const delta = round(expected - current.cashUsdc, 2);
  if (Math.abs(delta) < 0.01) return current;
  // Never claw back cash above deployable floor — keeps redeem proceeds / realized wins.
  if (delta < 0 && current.cashUsdc > expected) return current;

  try {
    const updated = await adjustMandateCash(current.id, fundSlug, delta);
    return updated ?? current;
  } catch {
    return current;
  }
}

/** Heal drifted cash and positions for every mandate in a fund. */
export async function reconcileFundMandates(fundSlug: string): Promise<Mandate[]> {
  const mandates = await listMandatesByFund(fundSlug);
  const reconciled: Mandate[] = [];

  for (const mandate of mandates) {
    const positions = await reconcileMandatePositions(fundSlug, mandate.id);
    reconciled.push(await reconcileMandateCash(fundSlug, mandate, positions));
  }

  return reconciled;
}
