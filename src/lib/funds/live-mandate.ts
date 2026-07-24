import { saveMandateRecord } from "@/lib/funds/mandates";
import { tradePnlUsdc } from "@/lib/funds/valuation";
import type { Mandate, MandateTrade } from "@/lib/funds/types";

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

/**
 * Per-mandate books for one fund slug.
 *
 * Boundary: profit/deployable come from this mandate's fund trades + stored
 * deposit only. Never Polymarket /value or /positions for the whole wallet —
 * those mix external CLOB activity and other funds on the same deposit address.
 */
export async function liveMandateBooks(
  mandate: Mandate,
  filledTrades: MandateTrade[] = [],
  depositAddress?: string,
  valuations: Map<string, number> = new Map(),
): Promise<LiveMandateBooks | null> {
  const known = knownCommitUsdc(
    mandate.investorWallet,
    depositAddress,
  );
  const stored = mandate.depositedUsdc;
  const depositedUsdc =
    known != null
      ? known
      : stored != null && stored > 0
        ? round(stored, 2)
        : null;
  if (depositedUsdc == null || depositedUsdc <= 0) return null;

  const own = filledTrades.filter(
    (trade) =>
      trade.status === "filled" &&
      (!trade.mandateId || trade.mandateId === mandate.id),
  );

  let profitUsdc = 0;
  for (const trade of own) {
    const pnl = tradePnlUsdc(trade, valuations);
    if (pnl != null) profitUsdc = round(profitUsdc + pnl, 2);
  }

  const deployableUsdc = round(Math.max(0, depositedUsdc + profitUsdc), 2);
  // Keep ledger cash — do not replace with shared wallet collateral.
  const cashUsdc = round(Math.max(0, mandate.cashUsdc), 2);

  return {
    depositedUsdc,
    deployableUsdc,
    profitUsdc,
    openCostUsdc: 0,
    openValueUsdc: round(Math.max(0, deployableUsdc - cashUsdc), 2),
    cashUsdc,
  };
}

/** Persist fund-scoped deposited/notional — never wallet-wide equity. */
export async function healMandateFromLive(
  mandate: Mandate,
  live: LiveMandateBooks,
): Promise<Mandate> {
  const next: Mandate = {
    ...mandate,
    depositedUsdc: live.depositedUsdc,
    notionalUsdc: live.deployableUsdc,
    // Preserve ledger cash; wallet USDC is shared across funds / external use.
    cashUsdc: mandate.cashUsdc,
    updatedAt: new Date().toISOString(),
  };

  if (
    next.depositedUsdc !== mandate.depositedUsdc ||
    next.notionalUsdc !== mandate.notionalUsdc
  ) {
    await saveMandateRecord(next);
  }

  return next;
}
