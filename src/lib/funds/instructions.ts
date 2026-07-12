import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ManagerInstruction, MarketSide } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

export async function listInstructionsByFund(
  fundSlug: string,
): Promise<ManagerInstruction[]> {
  const rows = await mandateDocClient().send(
    new QueryCommand({
      TableName: mandatesTableName(),
      KeyConditionExpression: "fundSlug = :slug AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":slug": fundSlug,
        ":prefix": "instruction#",
      },
    }),
  );

  return (rows.Items ?? [])
    .map((row) => row.instruction as ManagerInstruction)
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInstruction(
  fundSlug: string,
  instructionId: string,
): Promise<ManagerInstruction | undefined> {
  const rows = await listInstructionsByFund(fundSlug);
  return rows.find((row) => row.id === instructionId);
}

export async function createInstruction(input: {
  fundSlug: string;
  managerWallet: string;
  tokenId: string;
  question: string;
  side: MarketSide;
  totalUsdc: number;
  price: number;
}): Promise<ManagerInstruction> {
  const shares = round(input.totalUsdc / input.price, 4);
  const instruction: ManagerInstruction = {
    id: randomUUID(),
    fundSlug: input.fundSlug,
    managerWallet: input.managerWallet.toLowerCase(),
    tokenId: input.tokenId,
    question: input.question,
    side: input.side,
    totalUsdc: round(input.totalUsdc, 2),
    price: round(input.price, 4),
    shares,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await saveInstruction(instruction);
  return instruction;
}

export async function markInstructionStatus(
  fundSlug: string,
  instructionId: string,
  status: ManagerInstruction["status"],
): Promise<ManagerInstruction | undefined> {
  const instruction = await getInstruction(fundSlug, instructionId);
  if (!instruction) return undefined;

  const updated: ManagerInstruction = {
    ...instruction,
    status,
    executedAt:
      status === "executed" ? new Date().toISOString() : instruction.executedAt,
  };

  await saveInstruction(updated);
  return updated;
}

async function saveInstruction(instruction: ManagerInstruction): Promise<void> {
  await mandateDocClient().send(
    new PutCommand({
      TableName: mandatesTableName(),
      Item: {
        fundSlug: instruction.fundSlug,
        sk: mandateSk("instruction", instruction.id),
        instruction,
      },
    }),
  );
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
