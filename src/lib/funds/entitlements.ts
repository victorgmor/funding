import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION?.trim() ?? "eu-west-1";

function entitlementsTableName(): string | undefined {
  const explicit = process.env.ENTITLEMENTS_TABLE?.trim();
  if (explicit) return explicit;
  if (process.env.FUNDS_TABLE?.trim()) return "carriera-entitlements";
  return undefined;
}

const TABLE = entitlementsTableName();

type Entitlement = {
  wallet: string;
  slug: string;
  txHash: string;
  unlockedAt: string;
};

const memory = new Map<string, Entitlement>();

function useDynamo() {
  return Boolean(TABLE);
}

let client: DynamoDBDocumentClient | undefined;

function docClient(): DynamoDBDocumentClient {
  if (!TABLE) throw new Error("ENTITLEMENTS_TABLE is not configured");
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

function key(wallet: string, slug: string) {
  return `${wallet.toLowerCase()}#${slug}`;
}

export async function hasEntitlement(
  wallet: string,
  slug: string,
): Promise<boolean> {
  const id = key(wallet, slug);

  if (!useDynamo()) {
    return memory.has(id);
  }

  const row = await docClient().send(
    new GetCommand({
      TableName: TABLE,
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

  if (!useDynamo()) {
    memory.set(id, row);
    return;
  }

  try {
    await docClient().send(
      new PutCommand({
        TableName: TABLE,
        Item: row,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return;
    throw e;
  }
}
