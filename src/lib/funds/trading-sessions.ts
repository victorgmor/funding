import { GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { TradingSession } from "@/lib/funds/types";
import { encryptJson, decryptJson } from "@/lib/funds/session-crypto";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";

export type StoredClobCreds = {
  key: string;
  secret: string;
  passphrase: string;
};

type StoredPayload = TradingSession & { creds: StoredClobCreds };

export async function getTradingSession(
  fundSlug: string,
  wallet: string,
): Promise<TradingSession | undefined> {
  const payload = await readPayload(fundSlug, wallet);
  if (!payload) return undefined;
  const { creds: _creds, ...session } = payload;
  return session;
}

export async function readSessionCredsForExecution(
  fundSlug: string,
  wallet: string,
): Promise<StoredClobCreds | undefined> {
  const payload = await readPayload(fundSlug, wallet);
  return payload?.creds;
}

async function readPayload(
  fundSlug: string,
  wallet: string,
): Promise<StoredPayload | undefined> {
  const normalized = wallet.toLowerCase();

  const row = await mandateDocClient().send(
    new GetCommand({
      TableName: mandatesTableName(),
      Key: {
        fundSlug,
        sk: mandateSk("session", normalized),
      },
    }),
  );

  if (!row.Item?.sessionEnc) return undefined;
  return decryptJson<StoredPayload>(row.Item.sessionEnc as string);
}

export async function saveTradingSession(input: {
  fundSlug: string;
  investorWallet: string;
  depositAddress: string;
  signatureType: number;
  creds: StoredClobCreds;
}): Promise<TradingSession> {
  const now = new Date().toISOString();
  const existing = await getTradingSession(input.fundSlug, input.investorWallet);

  const session: StoredPayload = {
    fundSlug: input.fundSlug,
    investorWallet: input.investorWallet.toLowerCase(),
    depositAddress: input.depositAddress,
    signatureType: input.signatureType,
    authorized: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    creds: input.creds,
  };

  const enc = encryptJson(session);
  const normalized = session.investorWallet;

  await mandateDocClient().send(
    new PutCommand({
      TableName: mandatesTableName(),
      Item: {
        fundSlug: input.fundSlug,
        sk: mandateSk("session", normalized),
        sessionEnc: enc,
      },
    }),
  );

  const { creds: _creds, ...publicSession } = session;
  return publicSession;
}

export async function revokeTradingSession(
  fundSlug: string,
  wallet: string,
): Promise<void> {
  const normalized = wallet.toLowerCase();

  await mandateDocClient().send(
    new DeleteCommand({
      TableName: mandatesTableName(),
      Key: {
        fundSlug,
        sk: mandateSk("session", normalized),
      },
    }),
  );
}
