import { randomUUID } from "node:crypto";
import { seedFunds } from "@/data/funds";
import {
  fetchPolymarketProfile,
  polymarketDisplayName,
} from "@/lib/polymarket/profile";
import {
  dbGetFund,
  dbListFunds,
  dbListFundsByCreator,
  dbPutFund,
  dbSlugExists,
  dbUpdateFund,
} from "@/lib/funds/dynamodb";
import type { Fund, FundManager } from "@/lib/funds/types";
import {
  parseFundDateInput,
  validateLifecycleDates,
} from "@/lib/funds/lifecycle";
import { settleFund, type FundSettlement } from "@/lib/funds/settlement";
import { isCreatorWallet } from "@/lib/funds/creator";
import { isUserFund } from "@/lib/funds/editable";

export { isUserFund } from "@/lib/funds/editable";

export type UpdateFundInput = {
  name: string;
  thesis: string;
  managerAddress: string;
  message: string;
  signature: `0x${string}`;
  unlockPriceUsdc?: number | null;
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

async function replaceUserFund(fund: Fund): Promise<void> {
  await dbUpdateFund(fund);
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
    unlockPriceUsdc: parseUnlockPrice(input.unlockPriceUsdc),
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

export async function getAllFunds(): Promise<Fund[]> {
  const userFunds = await dbListFunds();
  return [...seedFunds, ...userFunds];
}

export async function getFund(slug: string): Promise<Fund | undefined> {
  const seed = seedFunds.find((fund) => fund.slug === slug);
  if (seed) return seed;
  return dbGetFund(slug);
}

export async function getFundsByCreator(creatorId: string): Promise<Fund[]> {
  const id = creatorId.toLowerCase();
  const fromSeed = seedFunds.filter((fund) => fund.manager.id.toLowerCase() === id);
  const fromDb = await dbListFundsByCreator(id);
  const seen = new Set(fromSeed.map((fund) => fund.slug));
  return [...fromSeed, ...fromDb.filter((fund) => !seen.has(fund.slug))];
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
  if (seedFunds.some((fund) => fund.slug === slug)) return true;
  return dbSlugExists(slug);
}

function parseUnlockPrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (price < 1) throw new Error("Unlock price must be at least $1");
  return Math.round(price * 100) / 100;
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

function parseProfitSharePct(value: unknown): number {
  if (value == null || value === "") return 0;
  const pct = Number(value);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error("Profit share must be between 0 and 100");
  }
  return Math.round(pct * 100) / 100;
}

function validateCreateInput(input: CreateFundInput): string | null {
  const name = input.name?.trim() ?? "";
  const thesis = input.thesis?.trim() ?? "";

  if (name.length < 2) return "Fund name is required";
  if (thesis.length < 10) return "Thesis must be at least 10 characters";

  if (input.capUsdc != null) {
    const cap = Number(input.capUsdc);
    if (!Number.isFinite(cap) || cap <= 0) {
      return "Pool cap must be positive when set";
    }
  }

  try {
    if (input.unlockPriceUsdc != null) {
      parseUnlockPrice(input.unlockPriceUsdc);
    }
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

async function resolveManager(address: string): Promise<FundManager> {
  const profile = await fetchPolymarketProfile(address);
  return {
    id: address.toLowerCase(),
    name: polymarketDisplayName(profile, address),
    verified: Boolean(profile?.verifiedBadge),
  };
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
    unlockPriceUsdc: parseUnlockPrice(input.unlockPriceUsdc),
    tradingEndsAt,
    raiseEndsAt,
    capUsdc: parseCapUsdc(input.capUsdc),
    managerProfitSharePct: parseProfitSharePct(input.managerProfitSharePct),
  };

  await dbPutFund(fund);
  return fund;
}
