import { settleMandateTrade } from "@/lib/funds/execute-trades";
import { listPendingTradesForFund } from "@/lib/funds/execute-trades";
import {
  getTradingSession,
  readSessionCredsForExecution,
  readSessionPayload,
} from "@/lib/funds/trading-sessions";
import type { MandateTrade } from "@/lib/funds/types";
import { executeMandateTradeServer } from "@/lib/polymarket/server-trade";
import { serverSigningEnabled } from "@/lib/privy/server";

export type PendingTradeRun = {
  tradeId: string;
  status: "filled" | "failed" | "skipped";
  detail?: string;
};

export async function runPendingTradesForFund(
  fundSlug: string,
  investorWallet?: string,
): Promise<PendingTradeRun[]> {
  if (!serverSigningEnabled()) return [];

  const pending = await listPendingTradesForFund(fundSlug, investorWallet);
  const results: PendingTradeRun[] = [];

  for (const trade of pending) {
    results.push(await runSinglePendingTrade(fundSlug, trade));
  }

  return results;
}

async function runSinglePendingTrade(
  fundSlug: string,
  trade: MandateTrade,
): Promise<PendingTradeRun> {
  const session = await getTradingSession(fundSlug, trade.investorWallet);
  const payload = await readSessionPayload(fundSlug, trade.investorWallet);
  const creds = await readSessionCredsForExecution(fundSlug, trade.investorWallet);

  if (!session?.authorized || !session.serverSigner || !payload?.privyWalletId || !creds) {
    return { tradeId: trade.id, status: "skipped", detail: "No server signer session" };
  }

  try {
    const result = await executeMandateTradeServer({
      privyWalletId: payload.privyWalletId,
      investorWallet: trade.investorWallet as `0x${string}`,
      depositAddress: session.depositAddress,
      signatureType: session.signatureType,
      creds,
      trade,
    });

    const status = result.status === "filled" ? "filled" : "failed";
    await settleMandateTrade(fundSlug, trade, status, result.detail);

    return { tradeId: trade.id, status, detail: result.detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Server trade failed";
    await settleMandateTrade(fundSlug, trade, "failed", detail);
    return { tradeId: trade.id, status: "failed", detail };
  }
}
