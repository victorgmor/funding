import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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

export async function listPositionsByWallet(
  fundSlug: string,
  wallet: string,
): Promise<MandatePosition[]> {
  const normalized = wallet.toLowerCase();
  const positions = await listPositionsByFund(fundSlug);
  return positions.filter((row) => row.investorWallet === normalized);
}

export async function addPositionFromTrade(trade: MandateTrade): Promise<MandatePosition> {
  const positions = await listPositionsByFund(trade.fundSlug);
  const existing = positions.find(
    (row) => row.mandateId === trade.mandateId && row.tokenId === trade.tokenId,
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

  await savePosition(position);
  return position;
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
