import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { awsRegion, entitlementsTableName } from "@/lib/aws/dynamo-tables";

type Entitlement = {
  wallet: string;
  slug: string;
  txHash: string;
  unlockedAt: string;
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
  return entitlementsTableName();
}

function key(wallet: string, slug: string) {
  return `${wallet.toLowerCase()}#${slug}`;
}

export async function hasEntitlement(
  wallet: string,
  slug: string,
): Promise<boolean> {
  const id = key(wallet, slug);

  const row = await docClient().send(
    new GetCommand({
      TableName: table(),
      Key: { id },
      ProjectionExpression: "id",
    }),
  );

  return row.Item != null;
}

export async function grantEntitlement(
  wallet: string,
  slug: string,
  txHash: string,
): Promise<void> {
  const normalized = wallet.toLowerCase();
  const id = key(normalized, slug);
  const row: Entitlement & { id: string } = {
    id,
    wallet: normalized,
    slug,
    txHash: txHash.toLowerCase(),
    unlockedAt: new Date().toISOString(),
  };

  try {
    await docClient().send(
      new PutCommand({
        TableName: table(),
        Item: row,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return;
    throw e;
  }
}
