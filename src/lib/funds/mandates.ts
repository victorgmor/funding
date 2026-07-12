import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { demoMemory, ensureDemoMemory } from "@/lib/demo/memory";
import { useDemoStore } from "@/lib/demo/mode";
import type { Mandate, MandateStatus } from "@/lib/funds/types";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

function normalizeWallet(wallet: string) {
  return wallet.toLowerCase();
}

function mandateKey(fundSlug: string, wallet: string) {
  return `${fundSlug}#${normalizeWallet(wallet)}`;
}

export async function getMandate(
  fundSlug: string,
  wallet: string,
): Promise<Mandate | undefined> {
  if (useDemoStore()) {
    ensureDemoMemory();
    return demoMemory.mandates.get(mandateKey(fundSlug, wallet));
  }

  const row = await mandateDocClient().send(
    new GetCommand({
      TableName: mandatesTableName(),
      Key: { fundSlug, sk: mandateSk("mandate", normalizeWallet(wallet)) },
    }),
  );

  return row.Item?.mandate as Mandate | undefined;
}

export async function listMandatesByFund(fundSlug: string): Promise<Mandate[]> {
  if (useDemoStore()) {
    ensureDemoMemory();
    return [...demoMemory.mandates.values()]
      .filter((m) => m.fundSlug === fundSlug)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

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

  const cashUsdc = round(mandate.cashUsdc + deltaUsdc, 2);
  if (cashUsdc < 0) throw new Error("Mandate cash cannot go negative");

  const updated: Mandate = {
    ...mandate,
    cashUsdc,
    updatedAt: new Date().toISOString(),
  };

  await saveMandate(updated);
  return updated;
}

async function saveMandate(mandate: Mandate): Promise<void> {
  if (useDemoStore()) {
    ensureDemoMemory();
    demoMemory.mandates.set(
      mandateKey(mandate.fundSlug, mandate.investorWallet),
      mandate,
    );
    return;
  }

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
