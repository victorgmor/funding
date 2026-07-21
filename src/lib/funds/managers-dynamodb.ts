import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { awsRegion, managersTableName } from "@/lib/aws/dynamo-tables";

/** Canonical manager profile in DynamoDB (not embedded on each fund). */
export type ManagerRecord = {
  id: string;
  /** Polymarket / fallback display name */
  name: string;
  /** App username override (edit profile) */
  username: string;
  bio: string;
  /** https URL or data URL */
  avatarUrl: string | null;
  verified: boolean;
  updatedAt: string;
};

export type ManagerProfileInput = {
  id: string;
  name?: string;
  username?: string;
  bio?: string;
  avatarUrl?: string | null;
  verified?: boolean;
};

let client: DynamoDBDocumentClient | undefined;

function docClient(): DynamoDBDocumentClient {
  if (!client) {
    client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: awsRegion() }),
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }
  return client;
}

function table(): string {
  return managersTableName();
}

export function managerDisplayName(manager: ManagerRecord): string {
  return manager.username.trim() || manager.name.trim() || manager.id;
}

function asManager(item: Record<string, unknown>): ManagerRecord | undefined {
  if (!item?.id || typeof item.id !== "string") return undefined;
  return {
    id: item.id.toLowerCase(),
    name: typeof item.name === "string" ? item.name : item.id,
    username: typeof item.username === "string" ? item.username : "",
    bio: typeof item.bio === "string" ? item.bio : "",
    avatarUrl:
      typeof item.avatarUrl === "string" && item.avatarUrl
        ? item.avatarUrl
        : null,
    verified: Boolean(item.verified),
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt
        : new Date(0).toISOString(),
  };
}

function toItem(manager: ManagerRecord) {
  return {
    id: manager.id.toLowerCase(),
    name: manager.name,
    username: manager.username,
    bio: manager.bio,
    avatarUrl: manager.avatarUrl,
    verified: manager.verified,
    updatedAt: manager.updatedAt,
  };
}

export async function dbGetManager(
  id: string,
): Promise<ManagerRecord | undefined> {
  const row = await docClient().send(
    new GetCommand({
      TableName: table(),
      Key: { id: id.toLowerCase() },
    }),
  );
  return asManager((row.Item ?? {}) as Record<string, unknown>);
}

/** Batch-get managers by wallet id (chunks of 100). */
export async function dbBatchGetManagers(
  ids: string[],
): Promise<Map<string, ManagerRecord>> {
  const unique = [
    ...new Set(ids.map((id) => id.toLowerCase()).filter(Boolean)),
  ];
  const out = new Map<string, ManagerRecord>();
  if (unique.length === 0) return out;

  const name = table();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const row = await docClient().send(
      new BatchGetCommand({
        RequestItems: {
          [name]: {
            Keys: chunk.map((id) => ({ id })),
          },
        },
      }),
    );
    for (const item of row.Responses?.[name] ?? []) {
      const manager = asManager(item as Record<string, unknown>);
      if (manager) out.set(manager.id, manager);
    }
  }
  return out;
}

/** Full replace / upsert of a manager row. */
export async function dbPutManager(manager: ManagerRecord): Promise<void> {
  await docClient().send(
    new PutCommand({
      TableName: table(),
      Item: toItem({ ...manager, updatedAt: new Date().toISOString() }),
    }),
  );
}

/** Merge profile fields onto an existing (or empty) manager row. */
export async function dbMergeManager(
  input: ManagerProfileInput,
): Promise<ManagerRecord> {
  const id = input.id.toLowerCase();
  const existing = await dbGetManager(id);
  const next: ManagerRecord = {
    id,
    name: input.name ?? existing?.name ?? id,
    username:
      input.username !== undefined
        ? input.username
        : (existing?.username ?? ""),
    bio: input.bio !== undefined ? input.bio : (existing?.bio ?? ""),
    avatarUrl:
      input.avatarUrl !== undefined
        ? input.avatarUrl
        : (existing?.avatarUrl ?? null),
    verified:
      input.verified !== undefined
        ? input.verified
        : Boolean(existing?.verified),
    updatedAt: new Date().toISOString(),
  };
  await dbPutManager(next);
  return next;
}
