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
  getApiCredentials,
  resolveTradingWallet,
  type TradingWallet,
} from "@/lib/polymarket/wallet";
import { getClobBuilderConfig } from "@/lib/polymarket/builder";
import type { StoredClobCreds } from "@/lib/funds/trading-sessions";

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

export async function executeBuyQuote(
  walletClient: WalletClient,
  quote: BasketQuote,
  onStatus?: (message: string) => void,
  storedCreds?: StoredClobCreds,
): Promise<LegResult[]> {
  const { client, trading } = await createTradingClient(
    walletClient,
    onStatus,
    storedCreds,
  );
  const results: LegResult[] = [];

  for (const leg of quote.legs) {
    results.push(await executeLeg(client, leg, trading));
  }

  return results;
}

export async function executeMandateTrade(
  walletClient: WalletClient,
  trade: MandateTrade,
  onStatus?: (message: string) => void,
  storedCreds?: StoredClobCreds,
): Promise<LegResult> {
  const { client, trading } = await createTradingClient(
    walletClient,
    onStatus,
    storedCreds,
  );

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
  );
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
  );
}

async function executeLeg(
  client: ClobClient,
  leg: BasketQuote["legs"][number],
  trading: TradingWallet,
): Promise<LegResult> {
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
    return { question: leg.question, status: "filled" };
  } catch (e) {
    return {
      question: leg.question,
      status: "failed",
      detail: formatTradeError(e, trading),
    };
  }
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
