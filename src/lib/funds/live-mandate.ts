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
 * Keys may be Privy EOA, Safe/proxy (mandate.investorWallet), or session depositAddress.
 */
export const KNOWN_COMMIT_USDC: Record<string, number> = {
  "0xdc3b7020ae12ff2ace2a38612b32ad7dd1b4b50f": 16.4,
  "0x78ff1189b36cd929946027b35376a3a9ca556e56": 32.6,
  // mandate investorWallet (Safe) for the two above
  "0xb04565e0cb96c48d67d5c3468c9e0a15172b6ccc": 16.4,
  "0xa8b34fd3931544a6796cde8a0978bd483a4e36f1": 32.6,
};

export function knownCommitUsdc(
  ...wallets: Array<string | null | undefined>
): number | undefined {
  for (const w of wallets) {
    if (!w) continue;
    const v = KNOWN_COMMIT_USDC[w.toLowerCase()];
    if (v != null) return v;
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
 * deployable = live equity on the funded wallet (session depositAddress / Account pUSD)
 * deposited  = original commit (known map first)
 *
 * Mandate.investorWallet is often the Safe; pUSD sits on session.depositAddress.
 */
export async function liveMandateBooks(
  mandate: Mandate,
  _filledTrades: MandateTrade[] = [],
  depositAddress?: string,
  _valuations: Map<string, number> = new Map(),
): Promise<LiveMandateBooks | null> {
  void _filledTrades;
  void _valuations;

  const owner = mandate.investorWallet as Address;
  const sessionDeposit = depositAddress?.trim()
    ? (depositAddress.trim() as Address)
    : null;

  let derived = owner;
  try {
    derived = await deriveDepositWalletAddress(owner);
  } catch {
    /* keep owner */
  }

  const known = knownCommitUsdc(owner, sessionDeposit, derived);

  const candidates = [
    ...new Set(
      [owner, sessionDeposit, derived]
        .filter(Boolean)
        .map((a) => (a as string).toLowerCase()),
    ),
  ] as Address[];

  const balances = await Promise.all(
    candidates.map((addr) => safeCollateral(addr)),
  );
  const cashUsdc = Math.max(0, ...balances);

  // Prefer the wallet that actually holds cash (matches Account).
  let positionWallet = owner;
  let best = -1;
  for (let i = 0; i < candidates.length; i++) {
    if (balances[i]! >= best) {
      best = balances[i]!;
      positionWallet = candidates[i]!;
    }
  }

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
  } else if (
    stored != null &&
    stored > 0 &&
    liveEquity > 0 &&
    stored <= liveEquity + 0.01
  ) {
    depositedUsdc = round(stored, 2);
  } else if (liveEquity > 0) {
    depositedUsdc = round(Math.max(0, liveEquity - openPnlUsdc), 2);
  } else if (stored != null && stored > 0) {
    depositedUsdc = round(stored, 2);
  } else {
    return null;
  }

  const deployableUsdc = round(Math.max(liveEquity, depositedUsdc), 2);
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
