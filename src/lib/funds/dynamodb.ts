import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Fund } from "@/lib/funds/types";

const TABLE = process.env.FUNDS_TABLE?.trim();
const REGION = process.env.AWS_REGION?.trim() ?? "eu-west-1";

export function fundsTable(): string | undefined {
  return TABLE || undefined;
}

let client: DynamoDBDocumentClient | undefined;

function docClient(): DynamoDBDocumentClient {
  if (!TABLE) throw new Error("FUNDS_TABLE is not configured");
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

function toItem(fund: Fund) {
  return {
    slug: fund.slug,
    managerId: fund.manager.id.toLowerCase(),
    createdAt: fund.createdAt ?? new Date(0).toISOString(),
    fund,
  };
}

function fromItem(item: Record<string, unknown> | undefined): Fund | undefined {
  if (!item?.fund || typeof item.fund !== "object") return undefined;
  return item.fund as Fund;
}

export async function dbListFunds(): Promise<Fund[]> {
  const rows = await docClient().send(
    new ScanCommand({ TableName: TABLE, ProjectionExpression: "fund" }),
  );
  return (rows.Items ?? [])
    .map((item) => fromItem(item as Record<string, unknown>))
    .filter((fund): fund is Fund => fund != null);
}

export async function dbGetFund(slug: string): Promise<Fund | undefined> {
  const row = await docClient().send(
    new GetCommand({ TableName: TABLE, Key: { slug } }),
  );
  return fromItem(row.Item as Record<string, unknown> | undefined);
}

export async function dbListFundsByCreator(creatorId: string): Promise<Fund[]> {
  const rows = await docClient().send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "by-manager",
      KeyConditionExpression: "managerId = :managerId",
      ExpressionAttributeValues: { ":managerId": creatorId.toLowerCase() },
    }),
  );
  return (rows.Items ?? [])
    .map((item) => fromItem(item as Record<string, unknown>))
    .filter((fund): fund is Fund => fund != null);
}

export async function dbPutFund(fund: Fund): Promise<void> {
  try {
    await docClient().send(
      new PutCommand({
        TableName: TABLE,
        Item: toItem(fund),
        ConditionExpression: "attribute_not_exists(slug)",
      }),
    );
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) {
      throw new Error("A fund with this slug already exists");
    }
    throw e;
  }
}

export async function dbUpdateFundMarkets(
  slug: string,
  markets: Fund["markets"],
): Promise<void> {
  await docClient().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { slug },
      UpdateExpression: "SET fund.markets = :markets",
      ExpressionAttributeValues: { ":markets": markets },
    }),
  );
}

export async function dbUpdateFund(fund: Fund): Promise<void> {
  await docClient().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { slug: fund.slug },
      UpdateExpression: "SET fund = :fund",
      ExpressionAttributeValues: { ":fund": fund },
    }),
  );
}

export async function dbSlugExists(slug: string): Promise<boolean> {
  const row = await docClient().send(
    new GetCommand({
      TableName: TABLE,
      Key: { slug },
      ProjectionExpression: "slug",
    }),
  );
  return row.Item != null;
}
