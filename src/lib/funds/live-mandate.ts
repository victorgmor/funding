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
const KNOWN_COMMIT_USDC: Record<string, number> = {
  "0xdc3b7020ae12ff2ace2a38612b32ad7dd1b4b50f": 16.4,
  "0x78ff1189b36cd929946027b35376a3a9ca556e56": 32.6,
};

async function readMandateCashUsdc(owner: Address): Promise<{
  cashUsdc: number;
  positionWallet: Address;
  deposit: Address;
}> {
  const deposit = await deriveDepositWalletAddress(owner);
  const onOwner = await readCollateralAtAddressUsdc(owner);
  const onDeposit = await readCollateralAtAddressUsdc(deposit);

  // Prefer whichever wallet actually holds the funds (Account balance).
  if (onDeposit >= onOwner) {
    return {
      cashUsdc: onDeposit,
      positionWallet: onDeposit > 0 ? deposit : owner,
      deposit,
    };
  }
  return {
    cashUsdc: onOwner,
    positionWallet: owner,
    deposit,
  };
}

function knownCommit(
  owner: Address,
  deposit: Address,
): number | undefined {
  return (
    KNOWN_COMMIT_USDC[owner.toLowerCase()] ??
    KNOWN_COMMIT_USDC[deposit.toLowerCase()]
  );
}

/**
 * deployable = live equity on the funded wallet (matches Account pUSD)
 * deposited  = original commit (known map, else stored if sane, else equity)
 */
export async function liveMandateBooks(
  mandate: Mandate,
  _filledTrades: MandateTrade[],
  _depositAddress: string | undefined,
  _valuations: Map<string, number>,
): Promise<LiveMandateBooks | null> {
  void _filledTrades;
  void _depositAddress;
  void _valuations;

  const owner = mandate.investorWallet as Address;
  const { cashUsdc, positionWallet, deposit } =
    await readMandateCashUsdc(owner);

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

  const deployableUsdc = round(Math.max(0, cashUsdc + openValueUsdc), 2);
  if (deployableUsdc <= 0 && (mandate.depositedUsdc ?? 0) <= 0) return null;

  const known = knownCommit(owner, deposit);
  const stored = mandate.depositedUsdc;

  // Known commit wins. Otherwise keep stored only if it sits under live equity
  // (a real deposit can't exceed deployable). Else fall back to equity − open PnL.
  let depositedUsdc: number;
  if (known != null) {
    depositedUsdc = known;
  } else if (stored != null && stored > 0 && stored <= deployableUsdc + 0.01) {
    depositedUsdc = round(stored, 2);
  } else {
    depositedUsdc = round(Math.max(0, deployableUsdc - openPnlUsdc), 2);
  }

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
