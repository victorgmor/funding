import { createViemAccount } from "@privy-io/node/viem";
import { createWalletClient, http, type Hex } from "viem";
import { polygon } from "viem/chains";
import type { MandateTrade } from "@/lib/funds/types";
import type { LegResult } from "@/lib/polymarket/trade";
import { executeMandateTradeWithSession } from "@/lib/polymarket/trade";
import { ensureDepositWalletApprovalsServer } from "@/lib/polymarket/deposit-approvals-server";
import {
  getAuthorizationContext,
  getPrivyServerClient,
  serverSigningEnabled,
} from "@/lib/privy/server";
import type { StoredClobCreds } from "@/lib/funds/trading-sessions";

export async function executeMandateTradeServer(input: {
  privyWalletId: string;
  investorWallet: Hex;
  depositAddress: string;
  signatureType: number;
  creds: StoredClobCreds;
  trade: MandateTrade;
}): Promise<LegResult> {
  if (!serverSigningEnabled()) {
    throw new Error("Server signing is not configured");
  }

  const privy = getPrivyServerClient();
  const account = createViemAccount(privy, {
    walletId: input.privyWalletId,
    address: input.investorWallet,
    authorizationContext: getAuthorizationContext(),
  });

  const rpcUrl =
    process.env.POLYGON_RPC_URL?.trim() || "https://polygon-rpc.com";

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  });

  await ensureDepositWalletApprovalsServer(
    walletClient,
    input.depositAddress as `0x${string}`,
    undefined,
    { forceCtf: input.trade.orderSide === "SELL" },
  );

  return executeMandateTradeWithSession(walletClient, input.trade, {
    depositAddress: input.depositAddress,
    signatureType: input.signatureType,
    creds: input.creds,
  });
}
