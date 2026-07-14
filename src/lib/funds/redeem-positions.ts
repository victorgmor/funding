import { adjustMandateCash } from "@/lib/funds/mandates";
import {
  listAllPositionsByFund,
  savePositionRecord,
} from "@/lib/funds/mandate-positions";
import type { MandatePosition } from "@/lib/funds/types";
import { fetchMarketByTokenId } from "@/lib/polymarket/gamma";
import { submitResolvedPositionRedemption } from "@/lib/polymarket/redeem";
import { getRelayBuilderConfig } from "@/lib/polymarket/builder-server";
import {
  getTradingSession,
  readSessionPayload,
} from "@/lib/funds/trading-sessions";
import { resolvePrivyWalletId } from "@/lib/privy/resolve-wallet";
import { serverSigningEnabled } from "@/lib/privy/server";
import { createViemAccount } from "@privy-io/node/viem";
import { createWalletClient, http, type Hex } from "viem";
import { polygon } from "wagmi/chains";
import { getAuthorizationContext, getPrivyServerClient } from "@/lib/privy/server";
import { readOutcomeTokenBalance } from "@/lib/polymarket/redeem";

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

async function redeemSinglePosition(
  fundSlug: string,
  position: MandatePosition,
  builderConfig: NonNullable<ReturnType<typeof getRelayBuilderConfig>>,
): Promise<RedeemRun> {
  const market = await fetchMarketByTokenId(position.tokenId);
  if (!market?.resolved) {
    return {
      positionId: position.id,
      status: "skipped",
      detail: "Market not resolved yet",
    };
  }

  const session = await getTradingSession(fundSlug, position.investorWallet);
  const payload = await readSessionPayload(fundSlug, position.investorWallet);

  if (!session?.authorized || !session.serverSigner || !session.depositAddress) {
    return {
      positionId: position.id,
      status: "skipped",
      detail: "Auto-trading not authorized",
    };
  }

  const depositAddress = session.depositAddress as `0x${string}`;
  const onChainBalance = await readOutcomeTokenBalance(
    depositAddress,
    position.tokenId,
  );

  if (onChainBalance === 0n) {
    await markPositionRedeemed(position);
    return {
      positionId: position.id,
      status: "redeemed",
      detail: "Tokens already redeemed",
      proceedsUsdc: 0,
    };
  }

  const privyWalletId = await resolvePrivyWalletId(
    position.investorWallet,
    payload?.privyWalletId,
  );
  if (!privyWalletId) {
    return {
      positionId: position.id,
      status: "failed",
      detail: "Privy wallet not found — revoke and re-authorize auto-trading",
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
