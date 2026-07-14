import { DeleteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { demoMemory, ensureDemoMemory } from "@/lib/demo/memory";
import { useDemoStore } from "@/lib/demo/mode";
import type { MandatePosition, MandateTrade } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

function positionKey(mandateId: string, tokenId: string) {
  return `${mandateId}#${tokenId}`;
}

export async function listPositionsByFund(
  fundSlug: string,
): Promise<MandatePosition[]> {
  const positions = await listAllPositionsByFund(fundSlug);
  return positions.filter((row) => !row.redeemedAt);
}

export async function listAllPositionsByFund(
  fundSlug: string,
): Promise<MandatePosition[]> {
  if (useDemoStore()) {
    ensureDemoMemory();
    return [...demoMemory.positions.values()]
      .filter((row) => row.fundSlug === fundSlug)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const rows = await mandateDocClient().send(
    new QueryCommand({
      TableName: mandatesTableName(),
      KeyConditionExpression: "fundSlug = :slug AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":slug": fundSlug,
        ":prefix": "position#",
      },
    }),
  );

  return (rows.Items ?? [])
    .map((row) => row.position as MandatePosition)
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listPositionsByMandate(
  fundSlug: string,
  mandateId: string,
): Promise<MandatePosition[]> {
  const positions = await listPositionsByFund(fundSlug);
  return positions.filter((row) => row.mandateId === mandateId);
}

export async function listAllPositionsByMandate(
  fundSlug: string,
  mandateId: string,
): Promise<MandatePosition[]> {
  const positions = await listAllPositionsByFund(fundSlug);
  return positions.filter((row) => row.mandateId === mandateId);
}

export async function listPositionsByWallet(
  fundSlug: string,
  wallet: string,
): Promise<MandatePosition[]> {
  const normalized = wallet.toLowerCase();
  const positions = await listPositionsByFund(fundSlug);
  return positions.filter((row) => row.investorWallet === normalized);
}

export async function addPositionFromTrade(trade: MandateTrade): Promise<MandatePosition> {
  const positions = await listAllPositionsByFund(trade.fundSlug);
  const existing = positions.find(
    (row) =>
      row.mandateId === trade.mandateId &&
      row.tokenId === trade.tokenId &&
      !row.redeemedAt,
  );

  const now = new Date().toISOString();
  const position: MandatePosition = existing
    ? mergePosition(existing, trade, now)
    : {
        id: positionKey(trade.mandateId, trade.tokenId),
        mandateId: trade.mandateId,
        fundSlug: trade.fundSlug,
        investorWallet: trade.investorWallet,
        tokenId: trade.tokenId,
        question: trade.question,
        side: trade.side,
        shares: round(trade.shares, 4),
        avgPrice: round(trade.price, 4),
        costUsdc: round(trade.usdcAmount, 2),
        updatedAt: now,
      };

  await savePositionRecord(position);
  return position;
}

export async function deletePositionsForMandate(
  fundSlug: string,
  mandateId: string,
): Promise<void> {
  const existing = await listPositionsByMandate(fundSlug, mandateId);

  if (useDemoStore()) {
    ensureDemoMemory();
    for (const position of existing) {
      demoMemory.positions.delete(position.id);
    }
    return;
  }

  for (const position of existing) {
    await mandateDocClient().send(
      new DeleteCommand({
        TableName: mandatesTableName(),
        Key: {
          fundSlug,
          sk: mandateSk("position", position.id),
        },
      }),
    );
  }
}

export async function savePositionRecord(
  position: MandatePosition,
): Promise<void> {
  await savePosition(position);
}

function mergePosition(
  existing: MandatePosition,
  trade: MandateTrade,
  now: string,
): MandatePosition {
  const costUsdc = round(existing.costUsdc + trade.usdcAmount, 2);
  const shares = round(existing.shares + trade.shares, 4);
  const avgPrice = shares > 0 ? round(costUsdc / shares, 4) : existing.avgPrice;

  return {
    ...existing,
    question: trade.question,
    side: trade.side,
    shares,
    avgPrice,
    costUsdc,
    updatedAt: now,
  };
}

async function savePosition(position: MandatePosition): Promise<void> {
  if (useDemoStore()) {
    ensureDemoMemory();
    demoMemory.positions.set(position.id, position);
    return;
  }

  await mandateDocClient().send(
    new PutCommand({
      TableName: mandatesTableName(),
      Item: {
        fundSlug: position.fundSlug,
        sk: mandateSk("position", position.id),
        position,
      },
    }),
  );
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
