import { adjustMandateCash } from "@/lib/funds/mandates";
import {
  listAllPositionsByFund,
  savePositionRecord,
} from "@/lib/funds/mandate-positions";
import type { MandatePosition } from "@/lib/funds/types";
import { getAllFunds } from "@/lib/funds/store";
import { fetchMarketByTokenId } from "@/lib/polymarket/gamma";
import { submitResolvedPositionRedemption } from "@/lib/polymarket/redeem";
import { getRelayBuilderConfig } from "@/lib/polymarket/builder-server";
import { readSessionPayload } from "@/lib/funds/trading-sessions";
import { resolvePrivyWalletId } from "@/lib/privy/resolve-wallet";
import { serverSigningEnabled } from "@/lib/privy/server";
import { createViemAccount } from "@privy-io/node/viem";
import { createWalletClient, http, type Address, type Hex } from "viem";
import { polygon } from "wagmi/chains";
import { getAuthorizationContext, getPrivyServerClient } from "@/lib/privy/server";
import { readOutcomeTokenBalance } from "@/lib/polymarket/redeem";
import { isDepositWalletDeployed } from "@/lib/polymarket/depositWallet";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import {
  isWalletBusyError,
  WALLET_BUSY_MESSAGE,
} from "@/lib/polymarket/wallet-busy";

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export type RedeemRun = {
  positionId: string;
  status: "redeemed" | "skipped" | "failed";
  detail?: string;
  proceedsUsdc?: number;
};

export async function runRedemptionsForFund(
  fundSlug: string,
  investorWallet?: string,
): Promise<RedeemRun[]> {
  if (!serverSigningEnabled()) {
    throw new Error("Server signing not configured");
  }

  const builderConfig = getRelayBuilderConfig();
  if (!builderConfig) {
    throw new Error("Polymarket builder keys not configured");
  }

  let positions = await listAllPositionsByFund(fundSlug);
  positions = positions.filter((pos) => !pos.redeemedAt);

  if (investorWallet) {
    const normalized = investorWallet.toLowerCase();
    positions = positions.filter((pos) => pos.investorWallet === normalized);
  }

  const results: RedeemRun[] = [];
  for (const position of positions) {
    results.push(await redeemSinglePosition(fundSlug, position, builderConfig));
  }

  return results;
}

/** Redeem resolved positions for an investor across every fund. */
export async function runRedemptionsForInvestor(
  investorWallet: string,
): Promise<Array<RedeemRun & { fundSlug: string }>> {
  if (!serverSigningEnabled()) {
    throw new Error("Server signing not configured");
  }

  const normalized = investorWallet.toLowerCase();
  const funds = await getAllFunds();
  const results: Array<RedeemRun & { fundSlug: string }> = [];

  for (const fund of funds) {
    const runs = await runRedemptionsForFund(fund.slug, normalized);
    for (const run of runs) {
      results.push({ ...run, fundSlug: fund.slug });
    }
  }

  return results;
}

async function redeemSinglePosition(
  fundSlug: string,
  position: MandatePosition,
  builderConfig: NonNullable<ReturnType<typeof getRelayBuilderConfig>>,
): Promise<RedeemRun> {
  const payload = await readSessionPayload(fundSlug, position.investorWallet);

  const depositAddress = await resolveDepositAddress(
    position.investorWallet,
    payload?.depositAddress,
  );
  if (!depositAddress) {
    return {
      positionId: position.id,
      status: "skipped",
      detail: "Polymarket deposit wallet not registered",
    };
  }

  const market = await fetchMarketByTokenId(position.tokenId, {
    depositAddress,
  });
  if (!market?.resolved) {
    return {
      positionId: position.id,
      status: "skipped",
      detail: market ? "Market not resolved yet" : "Market data unavailable",
    };
  }

  const onChainBalance = await readOutcomeTokenBalance(
    depositAddress,
    position.tokenId,
  );

  if (onChainBalance === 0n) {
    const estimatedProceeds =
      market.settlementPrice != null
        ? round(position.shares * market.settlementPrice, 2)
        : 0;
    if (estimatedProceeds > 0 && position.costUsdc > 0) {
      await adjustMandateCash(position.mandateId, fundSlug, estimatedProceeds);
    }
    await markPositionRedeemed(position);
    return {
      positionId: position.id,
      status: "redeemed",
      detail: "Tokens already redeemed",
      proceedsUsdc: estimatedProceeds,
    };
  }

  const privyWalletId = await resolvePrivyWalletId(
    position.investorWallet,
    payload?.privyWalletId,
  );
  if (!privyWalletId) {
    return {
      positionId: position.id,
      status: "skipped",
      detail: "Authorize auto-trading once so the server can redeem for you",
    };
  }

  try {
    const privy = getPrivyServerClient();
    const account = createViemAccount(privy, {
      walletId: privyWalletId,
      address: position.investorWallet as Hex,
      authorizationContext: getAuthorizationContext(),
    });

    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(
        process.env.POLYGON_RPC_URL?.trim() || "https://polygon-rpc.com",
      ),
    });

    const proceedsUsdc = await submitResolvedPositionRedemption(
      walletClient,
      depositAddress,
      builderConfig,
      {
        conditionId: market.conditionId,
        negRisk: market.negRisk,
      },
    );

    await adjustMandateCash(position.mandateId, fundSlug, proceedsUsdc);
    await markPositionRedeemed(position);

    return {
      positionId: position.id,
      status: "redeemed",
      proceedsUsdc,
    };
  } catch (error) {
    if (isWalletBusyError(error)) {
      return {
        positionId: position.id,
        status: "skipped",
        detail: WALLET_BUSY_MESSAGE,
      };
    }
    const detail =
      error instanceof Error ? error.message : "Position redemption failed";
    return { positionId: position.id, status: "failed", detail };
  }
}

async function markPositionRedeemed(position: MandatePosition): Promise<void> {
  const now = new Date().toISOString();
  await savePositionRecord({
    ...position,
    shares: 0,
    costUsdc: 0,
    redeemedAt: now,
    updatedAt: now,
  });
}

async function resolveDepositAddress(
  investorWallet: string,
  sessionDeposit?: string,
): Promise<Address | null> {
  if (sessionDeposit) {
    return sessionDeposit as Address;
  }

  const owner = investorWallet as Address;
  const depositAddress = await deriveDepositWalletAddress(owner);
  const deployed = await isDepositWalletDeployed(depositAddress);
  return deployed ? depositAddress : null;
}
