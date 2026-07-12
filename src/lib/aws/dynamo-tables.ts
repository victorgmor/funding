import { useDemoStore } from "@/lib/demo/mode";

const REGION = process.env.AWS_REGION?.trim() ?? "eu-west-1";

const STORAGE_ERROR =
  "DynamoDB is required. Set FUNDS_TABLE (and optionally CHALLENGES_TABLE, MANDATES_TABLE), or DEMO_MODE=true for local styling.";

export function awsRegion(): string {
  return REGION;
}

export { useDemoStore };

export function requireFundsTable(): string {
  if (useDemoStore()) {
    throw new Error("DynamoDB is disabled in demo mode");
  }
  const table = process.env.FUNDS_TABLE?.trim();
  if (!table) throw new Error(STORAGE_ERROR);
  return table;
}

export function challengesTableName(): string {
  if (useDemoStore()) return "demo-challenges";
  requireFundsTable();
  return process.env.CHALLENGES_TABLE?.trim() || "carriera-challenges";
}

export function mandatesTableName(): string {
  if (useDemoStore()) return "demo-mandates";
  requireFundsTable();
  return process.env.MANDATES_TABLE?.trim() || "carriera-mandates";
}
