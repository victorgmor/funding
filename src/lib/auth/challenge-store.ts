import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { BundleAuthAction } from "@/lib/auth/bundle-auth";

const REGION = process.env.AWS_REGION?.trim() ?? "eu-west-1";

function challengesTableName(): string | undefined {
  const explicit = process.env.CHALLENGES_TABLE?.trim();
  if (explicit) return explicit;
  if (process.env.FUNDS_TABLE?.trim()) return "carriera-challenges";
  return undefined;
}

const TABLE = challengesTableName();

export type StoredChallenge = {
  address: string;
  action: BundleAuthAction;
  slug?: string;
  expiresAt: number;
};

const memory = new Map<string, StoredChallenge>();

function useDynamo() {
  return Boolean(TABLE);
}

let client: DynamoDBDocumentClient | undefined;

function docClient(): DynamoDBDocumentClient {
  if (!TABLE) throw new Error("CHALLENGES_TABLE is not configured");
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

function pruneMemory() {
  const now = Date.now();
  for (const [nonce, row] of memory) {
    if (row.expiresAt <= now) memory.delete(nonce);
  }
}

export async function saveChallenge(
  nonce: string,
  challenge: StoredChallenge,
): Promise<void> {
  if (!useDynamo()) {
    pruneMemory();
    memory.set(nonce, challenge);
    return;
  }

  await docClient().send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        nonce,
        address: challenge.address,
        action: challenge.action,
        slug: challenge.slug,
        expiresAt: challenge.expiresAt,
        ttl: Math.floor(challenge.expiresAt / 1000),
      },
    }),
  );
}

export async function consumeChallenge(
  nonce: string,
  expected: StoredChallenge,
): Promise<boolean> {
  if (!useDynamo()) {
    pruneMemory();
    const row = memory.get(nonce);
    if (
      !row ||
      row.address !== expected.address ||
      row.action !== expected.action ||
      row.slug !== expected.slug ||
      row.expiresAt <= Date.now()
    ) {
      return false;
    }
    memory.delete(nonce);
    return true;
  }

  try {
    await docClient().send(
      new DeleteCommand({
        TableName: TABLE,
        Key: { nonce },
        ConditionExpression:
          "address = :address AND #action = :action AND slug = :slug AND expiresAt > :now",
        ExpressionAttributeNames: { "#action": "action" },
        ExpressionAttributeValues: {
          ":address": expected.address,
          ":action": expected.action,
          ":slug": expected.slug ?? "",
          ":now": Date.now(),
        },
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return false;
    throw e;
  }
}
