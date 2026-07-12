import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { awsRegion, mandatesTableName } from "@/lib/aws/dynamo-tables";

export { mandatesTableName };

let client: DynamoDBDocumentClient | undefined;

export function mandateDocClient(): DynamoDBDocumentClient {
  if (!client) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: awsRegion() }), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

export function mandateSk(kind: string, id: string) {
  return `${kind}#${id}`;
}
