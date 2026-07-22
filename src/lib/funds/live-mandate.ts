import { saveMandateRecord } from "@/lib/funds/mandates";
import { readCollateralAtAddressUsdc } from "@/lib/polymarket/deposit-balance";
import {
  fetchPolymarketPositions,
  fetchPolymarketPositionsValue,
  positionPnlUsdc,
} from "@/lib/polymarket/portfolio";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
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

/**
 * Original commits for wallets corrupted by earlier heals.
 * Keys may be Privy EOA or Polymarket deposit/proxy — both are checked.
 */
export const KNOWN_COMMIT_USDC: Record<string, number> = {
  "0xdc3b7020ae12ff2ace2a38612b32ad7dd1b4b50f": 16.4,
  "0x78ff1189b36cd929946027b35376a3a9ca556e56": 32.6,
};

export function knownCommitUsdc(
  owner: string,
  deposit?: string | null,
): number | undefined {
  const o = owner.toLowerCase();
  if (KNOWN_COMMIT_USDC[o] != null) return KNOWN_COMMIT_USDC[o];
  if (deposit) {
    const d = deposit.toLowerCase();
    if (KNOWN_COMMIT_USDC[d] != null) return KNOWN_COMMIT_USDC[d];
  }
  return undefined;
}

async function safeCollateral(addr: Address): Promise<number> {
  try {
    return await readCollateralAtAddressUsdc(addr);
  } catch {
    return 0;
  }
}

/**
 * deployable = live equity on the funded wallet (matches Account pUSD)
 * deposited  = original commit (known map first — works even when RPC fails)
 */
export async function liveMandateBooks(
  mandate: Mandate,
  _filledTrades: MandateTrade[] = [],
  _depositAddress?: string,
  _valuations: Map<string, number> = new Map(),
): Promise<LiveMandateBooks | null> {
  void _filledTrades;
  void _depositAddress;
  void _valuations;

  const owner = mandate.investorWallet as Address;

  let deposit = owner;
  try {
    deposit = await deriveDepositWalletAddress(owner);
  } catch {
    /* keep owner */
  }

  const known = knownCommitUsdc(owner, deposit);

  const [onOwner, onDeposit] = await Promise.all([
    safeCollateral(owner),
    safeCollateral(deposit),
  ]);

  // Also probe known commit addresses directly (covers proxy-as-investor).
  let knownCash = 0;
  for (const addr of Object.keys(KNOWN_COMMIT_USDC)) {
    if (
      addr === owner.toLowerCase() ||
      addr === deposit.toLowerCase()
    ) {
      knownCash = Math.max(knownCash, await safeCollateral(addr as Address));
    }
  }

  const cashUsdc = Math.max(onOwner, onDeposit, knownCash);
  const positionWallet =
    onDeposit >= onOwner && onDeposit > 0 ? deposit : owner;

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

  const liveEquity = round(Math.max(0, cashUsdc + openValueUsdc), 2);
  const stored = mandate.depositedUsdc;

  let depositedUsdc: number;
  if (known != null) {
    depositedUsdc = known;
  } else if (stored != null && stored > 0 && liveEquity > 0 && stored <= liveEquity + 0.01) {
    depositedUsdc = round(stored, 2);
  } else if (liveEquity > 0) {
    depositedUsdc = round(Math.max(0, liveEquity - openPnlUsdc), 2);
  } else if (stored != null && stored > 0) {
    depositedUsdc = round(stored, 2);
  } else {
    return null;
  }

  // Deployable is live wallet equity; never below deposited for these books.
  const deployableUsdc = round(
    Math.max(liveEquity, depositedUsdc),
    2,
  );
  const profitUsdc = round(deployableUsdc - depositedUsdc, 2);

  return {
    depositedUsdc,
    deployableUsdc,
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
