import { settleExecutingTrade, settleMandateTrade } from "@/lib/funds/execute-trades";
import { listPendingTradesForFund } from "@/lib/funds/execute-trades";
import { lockPendingTradeForExecution } from "@/lib/funds/mandate-trades";
import {
  getTradingSession,
  readSessionCredsForExecution,
  readSessionPayload,
} from "@/lib/funds/trading-sessions";
import type { MandateTrade } from "@/lib/funds/types";
import { executeMandateTradeServer } from "@/lib/polymarket/server-trade";
import { getAllFunds } from "@/lib/funds/store";
import { resolvePrivyWalletId } from "@/lib/privy/resolve-wallet";
import { serverSigningEnabled } from "@/lib/privy/server";

export type PendingTradeRun = {
  tradeId: string;
  status: "filled" | "failed" | "skipped";
  detail?: string;
};

export type InvestorPendingTradeRun = PendingTradeRun & {
  fundSlug: string;
};

export async function runPendingTradesForFund(
  fundSlug: string,
  investorWallet?: string,
  instructionId?: string,
): Promise<PendingTradeRun[]> {
  if (!serverSigningEnabled()) {
    throw new Error("Server signing not configured");
  }

  const pending = await listPendingTradesForFund(
    fundSlug,
    investorWallet,
    instructionId,
  );
  const results: PendingTradeRun[] = [];

  for (const trade of pending) {
    results.push(await runSinglePendingTrade(fundSlug, trade));
  }

  return results;
}

/** Run pending fan-out slices for an investor across every fund. */
export async function runPendingTradesForInvestor(
  investorWallet: string,
): Promise<InvestorPendingTradeRun[]> {
  if (!serverSigningEnabled()) {
    throw new Error("Server signing not configured");
  }

  const normalized = investorWallet.toLowerCase();
  const funds = await getAllFunds();
  const results: InvestorPendingTradeRun[] = [];

  for (const fund of funds) {
    const runs = await runPendingTradesForFund(fund.slug, normalized);
    for (const run of runs) {
      results.push({ ...run, fundSlug: fund.slug });
    }
  }

  return results;
}

async function failPendingTrade(
  fundSlug: string,
  trade: MandateTrade,
  detail: string,
): Promise<PendingTradeRun> {
  await settleMandateTrade(fundSlug, trade, "failed", detail);
  return { tradeId: trade.id, status: "failed", detail };
}

async function runSinglePendingTrade(
  fundSlug: string,
  trade: MandateTrade,
): Promise<PendingTradeRun> {
  const session = await getTradingSession(fundSlug, trade.investorWallet);
  const payload = await readSessionPayload(fundSlug, trade.investorWallet);
  const creds = await readSessionCredsForExecution(fundSlug, trade.investorWallet);

  if (!session?.authorized || !session.serverSigner) {
    return failPendingTrade(fundSlug, trade, "Auto-trading not authorized");
  }
  if (!creds) {
    return failPendingTrade(
      fundSlug,
      trade,
      "Missing Polymarket credentials — revoke and re-authorize auto-trading",
    );
  }
  if (!session.depositAddress) {
    return failPendingTrade(
      fundSlug,
      trade,
      "Missing deposit wallet — re-authorize auto-trading",
    );
  }

  const privyWalletId = await resolvePrivyWalletId(
    trade.investorWallet,
    payload?.privyWalletId,
  );
  if (!privyWalletId) {
    return failPendingTrade(
      fundSlug,
      trade,
      "Privy wallet not found — revoke and re-authorize auto-trading",
    );
  }

  const locked = await lockPendingTradeForExecution(fundSlug, trade.id);
  if (!locked) {
    return {
      tradeId: trade.id,
      status: "skipped",
      detail: "Trade already executing or settled",
    };
  }

  try {
    const result = await executeMandateTradeServer({
      privyWalletId,
      investorWallet: trade.investorWallet as `0x${string}`,
      depositAddress: session.depositAddress,
      signatureType: session.signatureType,
      creds,
      trade: locked,
    });

    const status = result.status === "filled" ? "filled" : "failed";
    await settleExecutingTrade(fundSlug, trade.id, status, result.detail);

    return { tradeId: trade.id, status, detail: result.detail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Server trade failed";
    await settleExecutingTrade(fundSlug, trade.id, "failed", detail);
    return { tradeId: trade.id, status: "failed", detail };
  }
}
