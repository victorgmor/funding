import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import {
  fetchPolymarketProfile,
  polymarketDisplayName,
  polymarketProfileImage,
} from "@/lib/polymarket/profile";
import { deriveDepositWalletAddress } from "@/lib/polymarket/positions";
import {
  dbGetFund,
  dbListFunds,
  dbListFundsByCreator,
  dbPutFund,
  dbSlugExists,
  dbUpdateFund,
} from "@/lib/funds/dynamodb";
import {
  dbBatchGetManagers,
  dbGetManager,
  dbMergeManager,
  managerDisplayName,
  type ManagerRecord,
} from "@/lib/funds/managers-dynamodb";
import type { Fund, FundManager } from "@/lib/funds/types";
import {
  parseFundDateInput,
  validateLifecycleDates,
  type LifecycleStage,
  fundPatchForTestStage,
} from "@/lib/funds/lifecycle";
import { settleFund, type FundSettlement } from "@/lib/funds/settlement";
import { isCreatorWallet } from "@/lib/funds/creator";
import { isUserFund } from "@/lib/funds/editable";

export { isUserFund } from "@/lib/funds/editable";

/** Max pool cap for new funds (USD). */
export const MAX_POOL_CAP_USDC = 15_000;

/** Published funds are permanent — creators may close but not delete. */
export const PUBLISHED_FUND_CANNOT_DELETE =
  "Published funds cannot be deleted";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/i;

/** Polymarket deposit/proxy wallet — default username for new accounts. */
async function polymarketWalletAddress(
  owner: string,
  proxyWallet?: string | null,
): Promise<string> {
  const proxy = proxyWallet?.trim();
  if (proxy && ADDRESS_RE.test(proxy)) return proxy.toLowerCase();
  return (await deriveDepositWalletAddress(owner as Address)).toLowerCase();
}

export type UpdateFundInput = {
  name: string;
  thesis: string;
  managerAddress: string;
  message: string;
  signature: `0x${string}`;
};

export type CloseFundInput = {
  managerAddress: string;
  message: string;
  signature: `0x${string}`;
};

export type CreateFundInput = UpdateFundInput & {
  tradingEndsAt?: string | null;
  raiseEndsAt?: string | null;
  capUsdc?: number | null;
  managerProfitSharePct?: number;
};

export type CloseFundResult = {
  fund: Fund;
  settlement: FundSettlement;
};

export type SetLifecycleStageInput = {
  stage: LifecycleStage;
  managerAddress: string;
  message: string;
  signature: `0x${string}`;
};

async function replaceUserFund(fund: Fund): Promise<void> {
  await dbUpdateFund(fund);
}

function toFundManager(record: ManagerRecord): FundManager {
  return {
    id: record.id,
    name: managerDisplayName(record),
    verified: record.verified,
  };
}

/** Upsert canonical manager from Polymarket; never trust fund.manager snapshots. */
async function resolveManagerRecord(address: string): Promise<ManagerRecord> {
  const id = address.toLowerCase();
  const profile = await fetchPolymarketProfile(id);
  const existing = await dbGetManager(id);
  const username = existing
    ? existing.username
    : await polymarketWalletAddress(id, profile?.proxyWallet);

  return dbMergeManager({
    id,
    name: polymarketDisplayName(profile, id),
    // Only update verified when Polymarket returns a real profile.
    verified: profile
      ? Boolean(profile.verifiedBadge)
      : existing?.verified,
    // Keep custom avatar; otherwise seed from Polymarket.
    avatarUrl: existing?.avatarUrl ?? polymarketProfileImage(profile),
    username,
    bio: existing?.bio,
  });
}

async function resolveManager(address: string): Promise<FundManager> {
  return toFundManager(await resolveManagerRecord(address));
}

/** Overlay canonical manager profile onto each fund (name / verified). */
async function hydrateFunds(funds: Fund[]): Promise<Fund[]> {
  if (funds.length === 0) return funds;

  const ids = [
    ...new Set(funds.map((fund) => fund.manager.id.toLowerCase())),
  ];
  const byId = await dbBatchGetManagers(ids);

  // Backfill missing rows; keep in-memory results (do not re-read Dynamo).
  await Promise.all(
    ids
      .filter((id) => !byId.has(id))
      .map(async (id) => {
        byId.set(id, await resolveManagerRecord(id));
      }),
  );

  return funds.map((fund) => {
    const manager = byId.get(fund.manager.id.toLowerCase());
    // ponytail: never fall back to per-fund snapshotted verified/name
    if (!manager) {
      return {
        ...fund,
        manager: {
          id: fund.manager.id.toLowerCase(),
          name: fund.manager.id,
          verified: false,
        },
      };
    }
    return { ...fund, manager: toFundManager(manager) };
  });
}

export async function getManagerProfile(
  address: string,
): Promise<ManagerRecord> {
  const id = address.toLowerCase();
  const existing = await dbGetManager(id);
  if (existing) return existing;
  return resolveManagerRecord(id);
}

export async function updateManagerProfile(
  address: string,
  input: { username?: string; bio?: string; avatarUrl?: string | null },
): Promise<ManagerRecord> {
  return dbMergeManager({
    id: address,
    username: input.username,
    bio: input.bio,
    avatarUrl: input.avatarUrl,
  });
}

async function listUserFunds(): Promise<Fund[]> {
  return hydrateFunds(await dbListFunds());
}

async function getUserFund(slug: string): Promise<Fund | undefined> {
  const fund = await dbGetFund(slug);
  if (!fund) return undefined;
  const [hydrated] = await hydrateFunds([fund]);
  return hydrated;
}

async function saveUserFund(fund: Fund): Promise<void> {
  await dbPutFund(fund);
}

async function userFundSlugExists(slug: string): Promise<boolean> {
  return dbSlugExists(slug);
}

async function getEditableUserFund(
  slug: string,
  managerAddress: string,
): Promise<Fund> {
  const fund = await getFund(slug);
  if (!fund || !isUserFund(fund)) {
    throw new Error("Fund not found");
  }
  if (fund.manager.id.toLowerCase() !== managerAddress.toLowerCase()) {
    throw new Error("Only the creator can manage this fund");
  }
  return fund;
}

export async function updateFund(
  slug: string,
  input: UpdateFundInput,
): Promise<Fund> {
  const error =
    validateCreateInput(input) ??
    validateAddress(input.managerAddress) ??
    validatePublishAuth(input);
  if (error) throw new Error(error);

  const fund = await getEditableUserFund(slug, input.managerAddress);
  if (fund.status === "closed") {
    throw new Error("Closed funds cannot be edited");
  }

  const updated: Fund = {
    ...fund,
    name: input.name.trim(),
    description: input.thesis.trim().slice(0, 120),
    thesis: input.thesis.trim(),
  };

  await replaceUserFund(updated);
  return updated;
}

export async function closeFund(
  slug: string,
  input: CloseFundInput,
): Promise<CloseFundResult> {
  const error =
    validateAddress(input.managerAddress) ?? validatePublishAuth(input);
  if (error) throw new Error(error);

  const fund = await getEditableUserFund(slug, input.managerAddress);
  if (fund.status === "closed") {
    throw new Error("Fund is already closed");
  }

  const updated: Fund = {
    ...fund,
    status: "closed",
    closedAt: new Date().toISOString(),
  };
  await replaceUserFund(updated);

  const settlement = await settleFund(updated);

  return { fund: updated, settlement };
}

/** Auto-archive a fund that reached trading with $0 raised (called by cron). */
export async function archiveFund(slug: string): Promise<Fund> {
  const fund = await getFund(slug);
  if (!fund) throw new Error("Fund not found");
  if (fund.status === "archived") return fund;

  const archivedAt = new Date().toISOString();
  const archived: Fund = {
    ...fund,
    status: "archived",
    archivedAt,
    closedAt: fund.closedAt ?? archivedAt,
  };
  await replaceUserFund(archived);
  return archived;
}

/** Restore an archived fund to trading (manager-initiated). */
export async function unarchiveFund(slug: string): Promise<Fund> {
  const fund = await getFund(slug);
  if (!fund) throw new Error("Fund not found");
  if (fund.status !== "archived") return fund;

  const restored: Fund = { ...fund, status: "trading" };
  await replaceUserFund(restored);
  return restored;
}

export async function getAllFunds(): Promise<Fund[]> {
  return listUserFunds();
}

export async function getFund(slug: string): Promise<Fund | undefined> {
  return getUserFund(slug);
}

export async function getFundsByCreator(creatorId: string): Promise<Fund[]> {
  return hydrateFunds(await dbListFundsByCreator(creatorId.toLowerCase()));
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "fund";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (await slugTaken(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

async function slugTaken(slug: string): Promise<boolean> {
  return userFundSlugExists(slug);
}

function parseOptionalIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return parseFundDateInput(text);
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error("Invalid date");
  return new Date(ms).toISOString();
}

function parseCapUsdc(value: unknown): number | null {
  if (value == null || value === "") return null;
  const cap = Number(value);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  return Math.round(cap * 100) / 100;
}

function validateCapUsdc(value: unknown): string | null {
  if (value == null || value === "") return "Pool cap is required";
  const cap = Number(value);
  if (!Number.isFinite(cap) || cap <= 0) return "Pool cap must be positive";
  if (cap > MAX_POOL_CAP_USDC) {
    return `Pool cap cannot exceed $${MAX_POOL_CAP_USDC.toLocaleString("en-US")}`;
  }
  return null;
}

function parseProfitSharePct(value: unknown): number {
  if (value == null || value === "") return 0;
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) {
    throw new Error("Profit share must be between 0 and 50");
  }
  return Math.round(pct * 100) / 100;
}

function validateCreateInput(input: CreateFundInput): string | null {
  const name = input.name?.trim() ?? "";
  const thesis = input.thesis?.trim() ?? "";

  if (name.length < 2) return "Fund name is required";
  if (thesis.length < 10) return "Thesis must be at least 10 characters";

  const capError = validateCapUsdc(input.capUsdc);
  if (capError) return capError;

  try {
    if (input.managerProfitSharePct != null) {
      parseProfitSharePct(input.managerProfitSharePct);
    }
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid fund input";
  }

  return null;
}

function validateAddress(address: string | undefined): string | null {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return "Connect your wallet to publish";
  }
  return null;
}

function validatePublishAuth(input: CreateFundInput): string | null {
  if (!input.message?.trim()) return "Wallet signature required";
  if (!input.signature || !/^0x[a-fA-F0-9]+$/.test(input.signature)) {
    return "Wallet signature required";
  }
  return null;
}

export async function createFund(input: CreateFundInput): Promise<Fund> {
  const error =
    validateCreateInput(input) ??
    validateAddress(input.managerAddress) ??
    validatePublishAuth(input);
  if (error) throw new Error(error);

  const slug = await uniqueSlug(slugify(input.name.trim()));
  const createdAt = new Date().toISOString();
  const manager = await resolveManager(input.managerAddress);

  const raiseEndsAt = parseOptionalIso(input.raiseEndsAt);
  const tradingEndsAt = parseOptionalIso(input.tradingEndsAt);
  const lifecycleError = validateLifecycleDates(raiseEndsAt, tradingEndsAt);
  if (lifecycleError) throw new Error(lifecycleError);

  const fund: Fund = {
    id: randomUUID(),
    slug,
    name: input.name.trim(),
    description: input.thesis.trim().slice(0, 120),
    thesis: input.thesis.trim(),
    status: "trading",
    manager,
    createdAt,
    tradingEndsAt,
    raiseEndsAt,
    capUsdc: parseCapUsdc(input.capUsdc),
    managerProfitSharePct: parseProfitSharePct(input.managerProfitSharePct),
  };

  await saveUserFund(fund);
  return fund;
}

export async function setFundTestLifecycleStage(
  slug: string,
  input: SetLifecycleStageInput,
): Promise<Fund> {
  const error = validateAddress(input.managerAddress);
  if (error) throw new Error(error);

  const fund = await getFund(slug);
  if (!fund) {
    throw new Error("Fund not found");
  }

  if (!isUserFund(fund)) {
    throw new Error("Fund not found");
  }
  if (fund.manager.id.toLowerCase() !== input.managerAddress.toLowerCase()) {
    throw new Error("Only the creator can manage this fund");
  }

  const validStages: LifecycleStage[] = ["deposit", "trading", "closed"];
  if (!validStages.includes(input.stage)) {
    throw new Error("Invalid lifecycle stage");
  }

  const updated: Fund = {
    ...fund,
    ...fundPatchForTestStage(input.stage),
  };

  await replaceUserFund(updated);
  return updated;
}
