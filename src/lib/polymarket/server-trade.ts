import { createViemAccount } from "@privy-io/node/viem";
import { createWalletClient, http, type Hex } from "viem";
import { polygon } from "viem/chains";
import type { MandateTrade } from "@/lib/funds/types";
import type { LegResult } from "@/lib/polymarket/trade";
import { executeMandateTrade } from "@/lib/polymarket/trade";
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

  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(),
  });

  return executeMandateTrade(walletClient, input.trade, undefined, input.creds);
}
