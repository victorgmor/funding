const REGION = process.env.AWS_REGION?.trim() ?? "eu-west-1";

const STORAGE_ERROR =
  "DynamoDB is required. Set FUNDS_TABLE (and optionally CHALLENGES_TABLE, MANDATES_TABLE, MANAGERS_TABLE).";

export function awsRegion(): string {
  return REGION;
}

export function requireFundsTable(): string {
  const table = process.env.FUNDS_TABLE?.trim();
  if (!table) throw new Error(STORAGE_ERROR);
  return table;
}

export function challengesTableName(): string {
  requireFundsTable();
  return process.env.CHALLENGES_TABLE?.trim() || "carriera-challenges";
}

export function mandatesTableName(): string {
  requireFundsTable();
  return process.env.MANDATES_TABLE?.trim() || "carriera-mandates";
}

export function managersTableName(): string {
  requireFundsTable();
  return process.env.MANAGERS_TABLE?.trim() || "carriera-managers";
}
