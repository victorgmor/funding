import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { demoMemory, ensureDemoMemory } from "@/lib/demo/memory";
import { useDemoStore } from "@/lib/demo/mode";
import type { FanoutSlice, MandateTrade, MarketSide } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

export async function listTradesByFund(fundSlug: string): Promise<MandateTrade[]> {
  if (useDemoStore()) {
    ensureDemoMemory();
    return [...demoMemory.trades.values()]
      .filter((row) => row.fundSlug === fundSlug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

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

/** Atomically settle a pending trade — no-op if already claimed. */
export async function claimPendingTrade(
  fundSlug: string,
  tradeId: string,
  status: "filled" | "failed",
  detail?: string,
): Promise<MandateTrade | undefined> {
  if (useDemoStore()) {
    ensureDemoMemory();
    const trade = demoMemory.trades.get(tradeId);
    if (!trade || trade.status !== "pending") return undefined;
    const updated: MandateTrade = {
      ...trade,
      status,
      detail,
      filledAt: status === "filled" ? new Date().toISOString() : trade.filledAt,
    };
    demoMemory.trades.set(tradeId, updated);
    return updated;
  }

  const filledAt = status === "filled" ? new Date().toISOString() : undefined;
  try {
    const row = await mandateDocClient().send(
      new UpdateCommand({
        TableName: mandatesTableName(),
        Key: { fundSlug, sk: mandateSk("trade", tradeId) },
        ConditionExpression: "#trade.#status = :pending",
        UpdateExpression:
          "SET #trade.#status = :status, #trade.detail = :detail, #trade.filledAt = :filledAt",
        ExpressionAttributeNames: {
          "#trade": "trade",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":pending": "pending",
          ":status": status,
          ":detail": detail ?? null,
          ":filledAt": filledAt ?? null,
        },
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
  if (useDemoStore()) {
    ensureDemoMemory();
    demoMemory.trades.set(trade.id, trade);
    return;
  }

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
