import {
  AssetType,
  ClobClient,
  OrderType,
  Side,
} from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";
import type { BasketQuote, ExitQuote } from "@/lib/funds/types";
import {
  getApiCredentials,
  resolveTradingWallet,
} from "@/lib/polymarket/wallet";
import { getClobBuilderConfig } from "@/lib/polymarket/builder";

const HOST = "https://clob.polymarket.com";
const CHAIN = 137;

function orderError(resp: unknown): string | undefined {
  if (!resp || typeof resp !== "object") return undefined;
  const r = resp as { error?: string; errorMsg?: string; status?: number };
  return r.error ?? r.errorMsg;
}

export async function createTradingClient(
  walletClient: WalletClient,
  onStatus?: (message: string) => void,
) {
  const eoa = walletClient.account?.address;
  if (!eoa) throw new Error("Wallet account unavailable");

  onStatus?.("Setting up Polymarket wallet…");
  const trading = await resolveTradingWallet(walletClient, onStatus);

  const authClient = new ClobClient({
    host: HOST,
    chain: CHAIN,
    signer: walletClient,
  });
  const creds = await getApiCredentials(authClient);

  const client = new ClobClient({
    host: HOST,
    chain: CHAIN,
    signer: walletClient,
    creds,
    signatureType: trading.signatureType,
    funderAddress: trading.funderAddress,
    throwOnError: true,
    builderConfig: getClobBuilderConfig(),
  });

  onStatus?.("Syncing balance with Polymarket…");
  await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });

  return { client, trading };
}

export type LegResult = {
  question: string;
  status: "filled" | "failed";
  detail?: string;
};

export async function executeBuyQuote(
  walletClient: WalletClient,
  quote: BasketQuote,
  onStatus?: (message: string) => void,
): Promise<LegResult[]> {
  const { client, trading } = await createTradingClient(walletClient, onStatus);
  const results: LegResult[] = [];

  for (const leg of quote.legs) {
    try {
      const resp = await client.createAndPostMarketOrder(
        {
          tokenID: leg.tokenId,
          amount: leg.usdcAmount,
          side: Side.BUY,
        },
        {},
        OrderType.FOK,
      );
      const err = orderError(resp);
      if (err) throw new Error(err);
      results.push({ question: leg.question, status: "filled" });
    } catch (e) {
      results.push({
        question: leg.question,
        status: "failed",
        detail: formatTradeError(e, trading),
      });
    }
  }

  return results;
}

export async function executeExitQuote(
  walletClient: WalletClient,
  quote: ExitQuote,
  onStatus?: (message: string) => void,
): Promise<LegResult[]> {
  const { client, trading } = await createTradingClient(walletClient, onStatus);
  const results: LegResult[] = [];

  for (const leg of quote.legs) {
    try {
      const resp = await client.createAndPostMarketOrder(
        {
          tokenID: leg.tokenId,
          amount: leg.shares,
          side: Side.SELL,
        },
        {},
        OrderType.FOK,
      );
      const err = orderError(resp);
      if (err) throw new Error(err);
      results.push({ question: leg.question, status: "filled" });
    } catch (e) {
      results.push({
        question: leg.question,
        status: "failed",
        detail: formatTradeError(e, trading),
      });
    }
  }

  return results;
}

function formatTradeError(
  e: unknown,
  trading: Awaited<ReturnType<typeof resolveTradingWallet>>,
): string {
  const msg = e instanceof Error ? e.message : "Order failed";
  const lower = msg.toLowerCase();

  try {
    const parsed = JSON.parse(msg) as {
      error?: string;
      status?: number;
    };
    if (parsed.status === 0) {
      return "Could not reach Polymarket from your browser. Disable ad blockers, check your connection, and ensure POLY_BUILDER_* env vars are set on the server (needed for deposit wallet setup).";
    }
  } catch {
    /* not JSON */
  }

  if (lower.includes("builder not configured")) {
    return "Server missing Polymarket builder keys — add POLY_BUILDER_API_KEY, POLY_BUILDER_API_SECRET, and POLY_BUILDER_PASSPHRASE to the ECS service.";
  }

  if (lower.includes("deposit wallet")) {
    return msg;
  }

  if (
    lower.includes("balance") ||
    lower.includes("allowance") ||
    lower.includes("insufficient")
  ) {
    const short = `${trading.depositAddress.slice(0, 6)}…${trading.depositAddress.slice(-4)}`;
    return `Fund your Polymarket deposit wallet (${short}) with pUSD on Polygon — deposit at polymarket.com`;
  }

  if (lower.includes("signer") && lower.includes("api key")) {
    return "Polymarket API key mismatch — log in at polymarket.com with this wallet first";
  }

  if (lower.includes("maker address not allowed")) {
    return "Polymarket account setup incomplete — refresh and try again";
  }

  return msg;
}
