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
import { awsRegion, challengesTableName } from "@/lib/aws/dynamo-tables";
import { demoMemory, ensureDemoMemory } from "@/lib/demo/memory";
import { useDemoStore } from "@/lib/demo/mode";

export type StoredChallenge = {
  address: string;
  action: BundleAuthAction;
  slug?: string;
  expiresAt: number;
};

let client: DynamoDBDocumentClient | undefined;

function docClient(): DynamoDBDocumentClient {
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: awsRegion() }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

function table(): string {
  return challengesTableName();
}

export async function saveChallenge(
  nonce: string,
  challenge: StoredChallenge,
): Promise<void> {
  if (useDemoStore()) {
    ensureDemoMemory();
    demoMemory.challenges.set(nonce, challenge);
    return;
  }

  await docClient().send(
    new PutCommand({
      TableName: table(),
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
  if (useDemoStore()) {
    ensureDemoMemory();
    const row = demoMemory.challenges.get(nonce);
    if (
      !row ||
      row.address !== expected.address ||
      row.action !== expected.action ||
      row.slug !== expected.slug ||
      row.expiresAt <= Date.now()
    ) {
      return false;
    }
    demoMemory.challenges.delete(nonce);
    return true;
  }

  try {
    await docClient().send(
      new DeleteCommand({
        TableName: table(),
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
