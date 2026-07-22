import { saveMandateRecord } from "@/lib/funds/mandates";
import {
  readCollateralAtAddressUsdc,
  readDepositWalletBalanceUsdc,
} from "@/lib/polymarket/deposit-balance";
import {
  fetchPolymarketPositions,
  fetchPolymarketPositionsValue,
  positionPnlUsdc,
} from "@/lib/polymarket/portfolio";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import { tradePnlUsdc } from "@/lib/funds/valuation";
import type { Mandate, MandateTrade } from "@/lib/funds/types";
import type { Address } from "viem";

export type LiveMandateBooks = {
  depositedUsdc: number;
  deployableUsdc: number;
  profitUsdc: number;
  openCostUsdc: number;
  openValueUsdc: number;
  cashUsdc: number;
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ponytail: one-shot repair for deposits corrupted by earlier heals; remove once Dynamo is clean
const KNOWN_COMMIT_USDC: Record<string, number> = {
  "0xdc3b7020ae12ff2ace2a38612b32ad7dd1b4b50f": 16.4,
  "0x78ff1189b36cd929946027b35376a3a9ca556e56": 32.6,
};

/**
 * Cash backing this investor: prefer the mandate wallet itself (matches Account),
 * then the derived deposit child. Never sum Safe+EOA (double-counts).
 */
async function readMandateCashUsdc(owner: Address): Promise<{
  cashUsdc: number;
  positionWallet: Address;
}> {
  const onOwner = await readCollateralAtAddressUsdc(owner);
  if (onOwner >= 0.01) {
    return { cashUsdc: onOwner, positionWallet: owner };
  }

  const deposit = await deriveDepositWalletAddress(owner);
  const onDeposit = await readCollateralAtAddressUsdc(deposit);
  if (onDeposit >= 0.01) {
    return { cashUsdc: onDeposit, positionWallet: deposit };
  }

  // Fallback helper (deposit-only path).
  const viaHelper = await readDepositWalletBalanceUsdc(owner);
  return {
    cashUsdc: viaHelper,
    positionWallet: viaHelper >= 0.01 ? deposit : owner,
  };
}

/**
 * deployable = live wallet equity (Account pUSD + open Polymarket marks)
 * deposited  = original commit (known repair / reconstructed)
 */
export async function liveMandateBooks(
  mandate: Mandate,
  filledTrades: MandateTrade[],
  _depositAddress: string | undefined,
  valuations: Map<string, number>,
): Promise<LiveMandateBooks | null> {
  void _depositAddress;
  const owner = mandate.investorWallet as Address;
  const mandateTrades = filledTrades.filter(
    (trade) => trade.mandateId === mandate.id && trade.status === "filled",
  );

  const { cashUsdc, positionWallet } = await readMandateCashUsdc(owner);

  let openValueUsdc = 0;
  let openPnlUsdc = 0;
  try {
    openValueUsdc = await fetchPolymarketPositionsValue(positionWallet);
    for (const pos of await fetchPolymarketPositions(positionWallet)) {
      if ((pos.size ?? 0) <= 0 && !pos.redeemable) continue;
      openPnlUsdc = round(openPnlUsdc + positionPnlUsdc(pos), 2);
    }
  } catch {
    /* cash still counts */
  }

  let tradePnlUsdcTotal = 0;
  let tradeMarks = 0;
  for (const trade of mandateTrades) {
    const pnl = tradePnlUsdc(trade, valuations);
    if (pnl == null) continue;
    tradeMarks += 1;
    tradePnlUsdcTotal = round(tradePnlUsdcTotal + pnl, 2);
  }

  const deployableUsdc = round(Math.max(0, cashUsdc + openValueUsdc), 2);
  if (deployableUsdc <= 0 && (mandate.depositedUsdc ?? 0) <= 0) return null;

  const known = KNOWN_COMMIT_USDC[owner.toLowerCase()];
  const profitFromTrades =
    tradeMarks > 0 ? tradePnlUsdcTotal : openPnlUsdc;
  const derivedDeposited = round(
    Math.max(0, deployableUsdc - profitFromTrades),
    2,
  );

  const depositedUsdc = round(
    known ?? Math.max(mandate.depositedUsdc ?? 0, derivedDeposited),
    2,
  );

  const profitUsdc = round(deployableUsdc - depositedUsdc, 2);

  return {
    depositedUsdc,
    deployableUsdc: deployableUsdc > 0 ? deployableUsdc : depositedUsdc,
    profitUsdc,
    openCostUsdc: 0,
    openValueUsdc,
    cashUsdc,
  };
}

/** Persist live deposited/cash/notional so Dynamo stops serving corrupted books. */
export async function healMandateFromLive(
  mandate: Mandate,
  live: LiveMandateBooks,
): Promise<Mandate> {
  const next: Mandate = {
    ...mandate,
    depositedUsdc: live.depositedUsdc,
    notionalUsdc: live.deployableUsdc,
    cashUsdc: live.cashUsdc,
    updatedAt: new Date().toISOString(),
  };

  if (
    next.depositedUsdc !== mandate.depositedUsdc ||
    next.notionalUsdc !== mandate.notionalUsdc ||
    Math.abs(next.cashUsdc - mandate.cashUsdc) >= 0.01
  ) {
    await saveMandateRecord(next);
  }

  return next;
}
