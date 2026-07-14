import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Mandate, MandateStatus } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

function normalizeWallet(wallet: string) {
  return wallet.toLowerCase();
}

export async function getMandate(
  fundSlug: string,
  wallet: string,
): Promise<Mandate | undefined> {
  const row = await mandateDocClient().send(
    new GetCommand({
      TableName: mandatesTableName(),
      Key: { fundSlug, sk: mandateSk("mandate", normalizeWallet(wallet)) },
    }),
  );

  return row.Item?.mandate as Mandate | undefined;
}

export async function listMandatesByFund(fundSlug: string): Promise<Mandate[]> {
  const rows = await mandateDocClient().send(
    new QueryCommand({
      TableName: mandatesTableName(),
      KeyConditionExpression: "fundSlug = :slug AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":slug": fundSlug,
        ":prefix": "mandate#",
      },
    }),
  );

  return (rows.Items ?? [])
    .map((row) => row.mandate as Mandate)
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** All mandates for an investor wallet (table scan — fine at current scale). */
export async function listMandatesForInvestor(wallet: string): Promise<Mandate[]> {
  const normalized = normalizeWallet(wallet);
  const rows = await mandateDocClient().send(
    new ScanCommand({
      TableName: mandatesTableName(),
      FilterExpression:
        "begins_with(sk, :prefix) AND mandate.investorWallet = :wallet",
      ExpressionAttributeValues: {
        ":prefix": "mandate#",
        ":wallet": normalized,
      },
    }),
  );

  return (rows.Items ?? [])
    .map((row) => row.mandate as Mandate)
    .filter((mandate) => Boolean(mandate?.notionalUsdc))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function upsertMandateCommitment(
  fundSlug: string,
  wallet: string,
  amountUsdc: number,
): Promise<Mandate> {
  if (amountUsdc <= 0) throw new Error("Amount must be positive");

  const normalized = normalizeWallet(wallet);
  const existing = await getMandate(fundSlug, normalized);
  const now = new Date().toISOString();

  const mandate: Mandate = existing
    ? {
        ...existing,
        notionalUsdc: round(existing.notionalUsdc + amountUsdc, 2),
        cashUsdc: round(existing.cashUsdc + amountUsdc, 2),
        status: existing.status === "closed" ? "active" : existing.status,
        updatedAt: now,
      }
    : {
        id: randomUUID(),
        fundSlug,
        investorWallet: normalized,
        notionalUsdc: round(amountUsdc, 2),
        cashUsdc: round(amountUsdc, 2),
        status: "active",
        createdAt: now,
        updatedAt: now,
      };

  await saveMandate(mandate);
  return mandate;
}

export async function adjustMandateCash(
  mandateId: string,
  fundSlug: string,
  deltaUsdc: number,
): Promise<Mandate | undefined> {
  const mandates = await listMandatesByFund(fundSlug);
  const mandate = mandates.find((m) => m.id === mandateId);
  if (!mandate) return undefined;

  const now = new Date().toISOString();
  const values: Record<string, number | string> = {
    ":delta": deltaUsdc,
    ":zero": 0,
    ":now": now,
  };

  // ConditionExpression cannot use functions like if_not_exists.
  let condition = "attribute_exists(mandate)";
  if (deltaUsdc < 0) {
    values[":minCash"] = round(-deltaUsdc, 2);
    condition += " AND mandate.cashUsdc >= :minCash";
  }

  try {
    const row = await mandateDocClient().send(
      new UpdateCommand({
        TableName: mandatesTableName(),
        Key: {
          fundSlug,
          sk: mandateSk("mandate", mandate.investorWallet),
        },
        UpdateExpression:
          "SET mandate.cashUsdc = if_not_exists(mandate.cashUsdc, :zero) + :delta, mandate.updatedAt = :now",
        ConditionExpression: condition,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      }),
    );
    return row.Attributes?.mandate as Mandate | undefined;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      throw new Error("Mandate cash cannot go negative");
    }
    throw error;
  }
}

async function saveMandate(mandate: Mandate): Promise<void> {
  await mandateDocClient().send(
    new PutCommand({
      TableName: mandatesTableName(),
      Item: {
        fundSlug: mandate.fundSlug,
        sk: mandateSk("mandate", mandate.investorWallet),
        mandate,
      },
    }),
  );
}

export async function setMandateStatus(
  fundSlug: string,
  wallet: string,
  status: MandateStatus,
): Promise<Mandate | undefined> {
  const mandate = await getMandate(fundSlug, wallet);
  if (!mandate) return undefined;

  const updated: Mandate = {
    ...mandate,
    status,
    updatedAt: new Date().toISOString(),
  };

  await saveMandate(updated);
  return updated;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
