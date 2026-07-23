import { adjustMandateCash } from "@/lib/funds/mandates";
import { markInstructionStatus } from "@/lib/funds/instructions";
import {
  addPositionFromTrade,
  reducePositionFromTrade,
} from "@/lib/funds/mandate-positions";
import {
  claimPendingTrade,
  completeTradeExecution,
  listTradesByInstruction,
} from "@/lib/funds/mandate-trades";
import { getTradingSession } from "@/lib/funds/trading-sessions";
import type { MandateTrade } from "@/lib/funds/types";

export type ExecutionSummary = {
  instructionId: string;
  pending: number;
  filled: number;
  failed: number;
  skipped: number;
  withSession: number;
  withoutSession: number;
  status: "executing" | "executed" | "failed";
};

function isSell(trade: MandateTrade): boolean {
  return trade.orderSide === "SELL";
}

/** Settle a fan-out slice and update mandate cash / position ledger. */
export async function settleMandateTrade(
  fundSlug: string,
  trade: MandateTrade,
  status: "filled" | "failed",
  detail?: string,
): Promise<MandateTrade | undefined> {
  const updated = await claimPendingTrade(fundSlug, trade.id, status, detail);
  if (!updated) return undefined;
  return applyTradeSettlement(fundSlug, updated, status);
}

/** Settle after server-side CLOB execution (trade was locked as executing). */
export async function settleExecutingTrade(
  fundSlug: string,
  tradeId: string,
  status: "filled" | "failed",
  detail?: string,
): Promise<MandateTrade | undefined> {
  const updated = await completeTradeExecution(
    fundSlug,
    tradeId,
    status,
    detail,
  );
  if (!updated) return undefined;
  return applyTradeSettlement(fundSlug, updated, status);
}

async function applyTradeSettlement(
  fundSlug: string,
  trade: MandateTrade,
  status: "filled" | "failed",
): Promise<MandateTrade> {
  if (isSell(trade)) {
    if (status === "filled") {
      await reducePositionFromTrade(trade);
      await adjustMandateCash(trade.mandateId, fundSlug, trade.usdcAmount);
    }
    // Sell failures reserved no cash — nothing to refund.
  } else {
    if (status === "failed") {
      await adjustMandateCash(trade.mandateId, fundSlug, trade.usdcAmount);
    }
    if (status === "filled") {
      await addPositionFromTrade(trade);
    }
  }

  await syncInstructionStatus(fundSlug, trade.instructionId);
  return trade;
}

export async function syncInstructionStatus(
  fundSlug: string,
  instructionId: string,
): Promise<ExecutionSummary> {
  const trades = await listTradesByInstruction(fundSlug, instructionId);
  const pending = trades.filter(
    (t) => t.status === "pending" || t.status === "executing",
  ).length;
  const filled = trades.filter((t) => t.status === "filled").length;
  const failed = trades.filter((t) => t.status === "failed").length;
  const skipped = trades.filter((t) => t.status === "skipped").length;

  let withSession = 0;
  let withoutSession = 0;
  for (const trade of trades.filter((t) => t.status === "pending")) {
    const session = await getTradingSession(fundSlug, trade.investorWallet);
    if (session?.authorized) withSession += 1;
    else withoutSession += 1;
  }

  let status: ExecutionSummary["status"] = "executing";
  if (pending === 0) {
    status = filled > 0 ? "executed" : "failed";
    await markInstructionStatus(
      fundSlug,
      instructionId,
      status === "executed" ? "executed" : "failed",
    );
  }

  return {
    instructionId,
    pending,
    filled,
    failed,
    skipped,
    withSession,
    withoutSession,
    status,
  };
}

/** Orchestration entry after manager records an instruction. */
export async function beginInstructionExecution(
  fundSlug: string,
  instructionId: string,
): Promise<ExecutionSummary> {
  await markInstructionStatus(fundSlug, instructionId, "executing");
  return syncInstructionStatus(fundSlug, instructionId);
}

export async function listPendingTradesForFund(
  fundSlug: string,
  investorWallet?: string,
  instructionId?: string,
): Promise<MandateTrade[]> {
  const { listTradesByFund } = await import("@/lib/funds/mandate-trades");
  let trades = (await listTradesByFund(fundSlug)).filter(
    (t) => t.status === "pending",
  );
  if (investorWallet) {
    const normalized = investorWallet.toLowerCase();
    trades = trades.filter((t) => t.investorWallet === normalized);
  }
  if (instructionId) {
    trades = trades.filter((t) => t.instructionId === instructionId);
  }
  return trades;
}
