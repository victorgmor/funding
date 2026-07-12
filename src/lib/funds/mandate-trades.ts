import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { FanoutSlice, MandateTrade, MarketSide } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
  useMandateDynamo,
} from "@/lib/funds/mandate-db";

const memory = new Map<string, MandateTrade>();

export async function listTradesByFund(fundSlug: string): Promise<MandateTrade[]> {
  if (!useMandateDynamo()) {
    return [...memory.values()]
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

async function saveTrade(trade: MandateTrade): Promise<void> {
  if (!useMandateDynamo()) {
    memory.set(trade.id, trade);
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
