import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { FanoutSlice, MandateTrade, MarketSide } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

export async function listTradesByFund(fundSlug: string): Promise<MandateTrade[]> {
  const rows = await mandateDocClient().send(
    new QueryCommand({
      TableName: mandatesTableName(),
      KeyConditionExpression: "fundSlug = :slug AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":slug": fundSlug,
        ":prefix": "trade#",
      },
    }),
  );

  return (rows.Items ?? [])
    .map((row) => row.trade as MandateTrade)
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listTradesByInstruction(
  fundSlug: string,
  instructionId: string,
): Promise<MandateTrade[]> {
  const trades = await listTradesByFund(fundSlug);
  return trades.filter((trade) => trade.instructionId === instructionId);
}

export async function recordFanoutTrades(input: {
  fundSlug: string;
  instructionId: string;
  tokenId: string;
  question: string;
  side: MarketSide;
  price: number;
  slices: FanoutSlice[];
}): Promise<MandateTrade[]> {
  const now = new Date().toISOString();
  const trades: MandateTrade[] = input.slices
    .filter((slice) => slice.usdcAmount > 0)
    .map((slice) => ({
      id: randomUUID(),
      mandateId: slice.mandateId,
      instructionId: input.instructionId,
      fundSlug: input.fundSlug,
      investorWallet: slice.investorWallet,
      tokenId: input.tokenId,
      question: input.question,
      side: input.side,
      usdcAmount: slice.usdcAmount,
      price: input.price,
      shares: slice.shares,
      status: "pending",
      createdAt: now,
    }));

  for (const trade of trades) {
    await saveTrade(trade);
  }

  return trades;
}

export async function markTradeStatus(
  fundSlug: string,
  tradeId: string,
  status: MandateTrade["status"],
  detail?: string,
): Promise<MandateTrade | undefined> {
  const trades = await listTradesByFund(fundSlug);
  const trade = trades.find((row) => row.id === tradeId);
  if (!trade) return undefined;

  const updated: MandateTrade = {
    ...trade,
    status,
    detail,
    filledAt: status === "filled" ? new Date().toISOString() : trade.filledAt,
  };

  await saveTrade(updated);
  return updated;
}

/** Atomically lock a pending trade before CLOB execution. */
export async function lockPendingTradeForExecution(
  fundSlug: string,
  tradeId: string,
): Promise<MandateTrade | undefined> {
  return transitionTradeStatus(fundSlug, tradeId, "pending", "executing");
}

/** Finish a locked trade after CLOB execution. */
export async function completeTradeExecution(
  fundSlug: string,
  tradeId: string,
  status: "filled" | "failed",
  detail?: string,
): Promise<MandateTrade | undefined> {
  return transitionTradeStatus(fundSlug, tradeId, "executing", status, detail);
}

/** Atomically settle a pending trade — no-op if already claimed. */
export async function claimPendingTrade(
  fundSlug: string,
  tradeId: string,
  status: "filled" | "failed",
  detail?: string,
): Promise<MandateTrade | undefined> {
  return transitionTradeStatus(fundSlug, tradeId, "pending", status, detail);
}

async function transitionTradeStatus(
  fundSlug: string,
  tradeId: string,
  fromStatus: MandateTrade["status"],
  toStatus: MandateTrade["status"],
  detail?: string,
): Promise<MandateTrade | undefined> {
  const filledAt = toStatus === "filled" ? new Date().toISOString() : undefined;
  const updates = ["#trade.#status = :toStatus"];
  const values: Record<string, unknown> = {
    ":fromStatus": fromStatus,
    ":toStatus": toStatus,
  };

  if (detail !== undefined) {
    updates.push("#trade.detail = :detail");
    values[":detail"] = detail;
  }
  if (filledAt) {
    updates.push("#trade.filledAt = :filledAt");
    values[":filledAt"] = filledAt;
  }

  try {
    const row = await mandateDocClient().send(
      new UpdateCommand({
        TableName: mandatesTableName(),
        Key: { fundSlug, sk: mandateSk("trade", tradeId) },
        ConditionExpression: "#trade.#status = :fromStatus",
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeNames: {
          "#trade": "trade",
          "#status": "status",
        },
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return row.Attributes?.trade as MandateTrade | undefined;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function saveTrade(trade: MandateTrade): Promise<void> {
  await mandateDocClient().send(
    new PutCommand({
      TableName: mandatesTableName(),
      Item: {
        fundSlug: trade.fundSlug,
        sk: mandateSk("trade", trade.id),
        trade,
      },
    }),
  );
}
