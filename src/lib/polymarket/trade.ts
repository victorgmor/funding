import {
  AssetType,
  ClobClient,
  OrderType,
  Side,
  SignatureTypeV2,
  type ApiKeyCreds,
} from "@polymarket/clob-client-v2";
import type { WalletClient } from "viem";
import type { BasketQuote, LegResult, MandateTrade } from "@/lib/funds/types";
import {
  isWalletBusyError,
  WALLET_BUSY_MESSAGE,
} from "@/lib/polymarket/wallet-busy";
import {
  getApiCredentials,
  resolveTradingWallet,
  type TradingWallet,
} from "@/lib/polymarket/wallet";
import { getClobBuilderConfig } from "@/lib/polymarket/builder";
import type { StoredClobCreds } from "@/lib/funds/trading-sessions";

const HOST = "https://clob.polymarket.com";
const CHAIN = 137;
/** FOK book misses / races — retry before settling failed. */
const FOK_ATTEMPTS = 3;
const FOK_RETRY_MS = 400;

function orderError(resp: unknown): string | undefined {
  if (!resp || typeof resp !== "object") return undefined;
  const r = resp as { error?: string; errorMsg?: string; status?: number };
  return r.error ?? r.errorMsg;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Liquidity / transient CLOB failures — worth another FOK attempt. */
function isRetryableFokError(e: unknown): boolean {
  if (isWalletBusyError(e)) return false;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    msg.includes("balance") ||
    msg.includes("insufficient") ||
    msg.includes("allowance") ||
    msg.includes("api key") ||
    msg.includes("maker address") ||
    msg.includes("builder not configured") ||
    msg.includes("deposit wallet") ||
    msg.includes("authorization signature") ||
    msg.includes("no valid authorization")
  ) {
    return false;
  }
  return (
    msg.includes("no match") ||
    msg.includes("couldn't be fully filled") ||
    msg.includes("could not be fully filled") ||
    msg.includes("fully filled") ||
    msg.includes("fok") ||
    msg.includes("orderbook") ||
    msg.includes("timeout") ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("network")
  );
}

export async function createTradingClient(
  walletClient: WalletClient,
  onStatus?: (message: string) => void,
  storedCreds?: StoredClobCreds,
) {
  const eoa = walletClient.account?.address;
  if (!eoa) throw new Error("Wallet account unavailable");

  onStatus?.("Setting up Polymarket wallet…");
  const trading = await resolveTradingWallet(walletClient, onStatus);

  const creds =
    storedCreds ??
    (await getApiCredentials(
      new ClobClient({
        host: HOST,
        chain: CHAIN,
        signer: walletClient,
      }),
    ));

  const client = new ClobClient({
    host: HOST,
    chain: CHAIN,
    signer: walletClient,
    creds: creds as ApiKeyCreds,
    signatureType: trading.signatureType,
    funderAddress: trading.funderAddress,
    throwOnError: true,
    builderConfig: getClobBuilderConfig(),
  });

  onStatus?.("Syncing balance with Polymarket…");
  await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });

  return { client, trading, creds: creds as StoredClobCreds };
}


/** Server-side fan-out: use stored deposit wallet + CLOB creds (no browser relayer). */
export async function executeMandateTradeWithSession(
  walletClient: WalletClient,
  trade: MandateTrade,
  session: {
    depositAddress: string;
    signatureType: number;
    creds: StoredClobCreds;
  },
  onStatus?: (message: string) => void,
): Promise<LegResult> {
  if (!walletClient.account?.address) {
    throw new Error("Wallet account unavailable");
  }

  const trading: TradingWallet = {
    signatureType: session.signatureType as SignatureTypeV2,
    funderAddress: session.depositAddress,
    depositAddress: session.depositAddress,
  };

  const client = new ClobClient({
    host: HOST,
    chain: CHAIN,
    signer: walletClient,
    creds: session.creds as ApiKeyCreds,
    signatureType: trading.signatureType,
    funderAddress: trading.funderAddress,
    throwOnError: true,
    builderConfig: getClobBuilderConfig(),
  });

  onStatus?.("Syncing balance with Polymarket…");
  await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  if (trade.orderSide === "SELL") {
    await client.updateBalanceAllowance({
      asset_type: AssetType.CONDITIONAL,
      token_id: trade.tokenId,
    });
  }

  return executeLeg(
    client,
    {
      tokenId: trade.tokenId,
      question: trade.question,
      side: trade.side,
      usdcAmount: trade.usdcAmount,
      price: trade.price,
      shares: trade.shares,
    },
    trading,
    trade.orderSide === "SELL" ? Side.SELL : Side.BUY,
  );
}

async function executeLeg(
  client: ClobClient,
  leg: BasketQuote["legs"][number],
  trading: TradingWallet,
  orderSide: Side = Side.BUY,
): Promise<LegResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FOK_ATTEMPTS; attempt++) {
    try {
      const resp = await client.createAndPostMarketOrder(
        {
          tokenID: leg.tokenId,
          // BUY amount = USDC; SELL amount = shares
          amount: orderSide === Side.SELL ? leg.shares : leg.usdcAmount,
          side: orderSide,
          price: leg.price,
        },
        {},
        OrderType.FOK,
      );
      const err = orderError(resp);
      if (err) throw new Error(err);
      return { question: leg.question, status: "filled" };
    } catch (e) {
      lastError = e;
      if (!isRetryableFokError(e) || attempt === FOK_ATTEMPTS) break;
      await sleep(FOK_RETRY_MS * attempt);
    }
  }

  return {
    question: leg.question,
    status: "failed",
    detail: formatTradeError(lastError, trading),
  };
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
      data?: { error?: string };
    };
    if (isWalletBusyError(msg)) {
      return WALLET_BUSY_MESSAGE;
    }
    if (parsed.status === 0) {
      return "Could not reach Polymarket from your browser. Disable ad blockers, check your connection, and ensure POLY_BUILDER_* env vars are set on the server (needed for deposit wallet setup).";
    }
  } catch {
    /* not JSON */
  }

  if (lower.includes("wallet busy")) {
    return WALLET_BUSY_MESSAGE;
  }

  if (
    lower.includes("authorization signature") ||
    lower.includes("no valid authorization") ||
    (lower.includes("401") && lower.includes("privy"))
  ) {
    return "Server Privy authorization key mismatch — check PRIVY_AUTHORIZATION_PRIVATE_KEY matches the signer quorum (PUBLIC_PRIVY_SIGNER_QUORUM_ID), then have the investor revoke and re-authorize auto-trading";
  }

  if (lower.includes("builder not configured")) {
    return "Server missing Polymarket builder keys — add POLY_BUILDER_API_KEY, POLY_BUILDER_API_SECRET, and POLY_BUILDER_PASSPHRASE to the ECS service.";
  }

  if (lower.includes("deposit wallet")) {
    return msg;
  }

  // CLOB "not enough balance / allowance" is usually a balance shortfall,
  // not a missing approval — don't send users to re-authorize.
  if (lower.includes("balance") && lower.includes("allowance")) {
    const short = `${trading.depositAddress.slice(0, 6)}…${trading.depositAddress.slice(-4)}`;
    return `Deposit wallet (${short}) doesn't hold enough shares or pUSD for this order`;
  }

  if (lower.includes("allowance")) {
    const short = `${trading.depositAddress.slice(0, 6)}…${trading.depositAddress.slice(-4)}`;
    return `Deposit wallet (${short}) needs trading approval — revoke and re-authorize auto-trading`;
  }

  if (lower.includes("balance") || lower.includes("insufficient")) {
    const short = `${trading.depositAddress.slice(0, 6)}…${trading.depositAddress.slice(-4)}`;
    return `Fund your Polymarket deposit wallet (${short}) with pUSD on Polygon`;
  }

  if (lower.includes("signer") && lower.includes("api key")) {
    return "Polymarket API key mismatch — log in at polymarket.com with this wallet first";
  }

  if (lower.includes("maker address not allowed")) {
    return "Polymarket account setup incomplete — refresh and try again";
  }

  return msg;
}

export type { LegResult };
