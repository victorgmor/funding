import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION?.trim() ?? "eu-west-1";

export function mandatesTableName(): string | undefined {
  const explicit = process.env.MANDATES_TABLE?.trim();
  if (explicit) return explicit;
  if (process.env.FUNDS_TABLE?.trim()) return "carriera-mandates";
  return undefined;
}

export function useMandateDynamo() {
  return Boolean(mandatesTableName());
}

let client: DynamoDBDocumentClient | undefined;

export function mandateDocClient(): DynamoDBDocumentClient {
  const table = mandatesTableName();
  if (!table) throw new Error("MANDATES_TABLE is not configured");
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

export function mandateSk(kind: string, id: string) {
  return `${kind}#${id}`;
}
