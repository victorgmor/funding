import { createViemAccount } from "@privy-io/node/viem";
import { createWalletClient, http, type Hex } from "viem";
import { polygon } from "viem/chains";
import type { MandateTrade } from "@/lib/funds/types";
import type { LegResult } from "@/lib/polymarket/trade";
import { executeMandateTradeWithSession } from "@/lib/polymarket/trade";
import { ensureDepositWalletApprovalsServer } from "@/lib/polymarket/deposit-approvals-server";
import { readConditionalShares } from "@/lib/polymarket/deposit-balance";
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

  // Approvals verified on-chain are fine for sells — only heal what's missing.
  await ensureDepositWalletApprovalsServer(
    walletClient,
    input.depositAddress as `0x${string}`,
  );

  let trade = input.trade;
  if (trade.orderSide === "SELL") {
    // Recorded shares (usdc/price at buy time) can exceed the actual fill;
    // clamp to the on-chain balance so the CLOB doesn't reject the order.
    const held = await readConditionalShares(
      input.depositAddress as `0x${string}`,
      trade.tokenId,
    );
    if (held <= 0) {
      throw new Error("Deposit wallet holds no shares of this outcome");
    }
    if (trade.shares > held) {
      trade = {
        ...trade,
        shares: held,
        usdcAmount: Math.round(held * trade.price * 100) / 100,
      };
    }
  }

  return executeMandateTradeWithSession(walletClient, trade, {
    depositAddress: input.depositAddress,
    signatureType: input.signatureType,
    creds: input.creds,
  });
}
