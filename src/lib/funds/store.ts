import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { seedFunds } from "@/data/funds";
import { tokenIdForSide, captureCreationPrices } from "@/lib/polymarket/gamma";
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
  dbUpdateFundMarkets,
  fundsTable,
} from "@/lib/funds/dynamodb";
import type { Fund, FundManager, MarketPosition, MarketSide } from "@/lib/funds/types";

const DATA_DIR = join(process.cwd(), "data");
const USER_FUNDS_FILE = join(DATA_DIR, "user-funds.json");

export type CreateFundMarketInput = {
  gammaMarketId: string;
  conditionId: string;
  clobTokenIds: string;
  outcomes: string;
  question: string;
  side: MarketSide;
  weight: number;
};

export type CreateFundInput = {
  name: string;
  thesis: string;
  markets: CreateFundMarketInput[];
  managerAddress: string;
};

function useDynamo() {
  return Boolean(fundsTable());
}

function readUserFundsFile(): Fund[] {
  if (!existsSync(USER_FUNDS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(USER_FUNDS_FILE, "utf-8")) as Fund[];
  } catch {
    return [];
  }
}

function writeUserFundsFile(funds: Fund[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USER_FUNDS_FILE, JSON.stringify(funds, null, 2));
}

async function readUserFunds(): Promise<Fund[]> {
  if (useDynamo()) return dbListFunds();
  return readUserFundsFile();
}

async function writeUserFund(fund: Fund): Promise<void> {
  if (useDynamo()) {
    await dbPutFund(fund);
    return;
  }
  const funds = readUserFundsFile();
  funds.push(fund);
  writeUserFundsFile(funds);
}

async function updateUserFundMarkets(
  slug: string,
  markets: Fund["markets"],
): Promise<void> {
  if (useDynamo()) {
    await dbUpdateFundMarkets(slug, markets);
    return;
  }
  const funds = readUserFundsFile();
  const index = funds.findIndex((row) => row.slug === slug);
  if (index === -1) return;
  funds[index] = { ...funds[index]!, markets };
  writeUserFundsFile(funds);
}

export async function getAllFunds(): Promise<Fund[]> {
  const userFunds = await readUserFunds();
  return [...seedFunds, ...userFunds];
}

export async function getFund(slug: string): Promise<Fund | undefined> {
  const seed = seedFunds.find((fund) => fund.slug === slug);
  if (seed) return seed;
  if (useDynamo()) return dbGetFund(slug);
  return readUserFundsFile().find((fund) => fund.slug === slug);
}

export async function getFundsByCreator(creatorId: string): Promise<Fund[]> {
  const id = creatorId.toLowerCase();
  const fromSeed = seedFunds.filter((fund) => fund.manager.id.toLowerCase() === id);
  if (useDynamo()) {
    const fromDb = await dbListFundsByCreator(id);
    const seen = new Set(fromSeed.map((fund) => fund.slug));
    return [...fromSeed, ...fromDb.filter((fund) => !seen.has(fund.slug))];
  }
  const fromFile = readUserFundsFile().filter(
    (fund) => fund.manager.id.toLowerCase() === id,
  );
  return [...fromSeed, ...fromFile];
}

/** Backfill creation-time prices for user funds missing baselines */
export async function ensureFundBaseline(fund: Fund): Promise<Fund> {
  const hasBaseline =
    fund.markets.length > 0 &&
    fund.markets.every(
      (m) => m.entryPrice != null && Number.isFinite(m.entryPrice) && m.entryPrice > 0,
    );
  if (hasBaseline) return fund;

  const isSeed = seedFunds.some((row) => row.id === fund.id);
  if (isSeed) return fund;

  if (!fund.createdAt) return fund;

  const markets = await captureCreationPrices(
    fund.markets,
    new Date(fund.createdAt),
  );
  if (!markets.every((m) => m.entryPrice != null && m.entryPrice > 0)) {
    return fund;
  }

  await updateUserFundMarkets(fund.slug, markets);
  return { ...fund, markets };
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
  if (useDynamo()) return dbSlugExists(slug);
  return readUserFundsFile().some((fund) => fund.slug === slug);
}

function toMarketPosition(market: CreateFundMarketInput): MarketPosition {
  return {
    gammaMarketId: market.gammaMarketId,
    conditionId: market.conditionId,
    tokenId: tokenIdForSide(market.clobTokenIds, market.outcomes, market.side),
    question: market.question,
    side: market.side,
    weight: market.weight,
  };
}

function validateCreateInput(input: CreateFundInput): string | null {
  const name = input.name?.trim() ?? "";
  const thesis = input.thesis?.trim() ?? "";

  if (name.length < 2) return "Fund name is required";
  if (thesis.length < 10) return "Thesis must be at least 10 characters";
  if (!input.markets?.length) return "Add at least one market";

  const ids = new Set<string>();
  let totalWeight = 0;

  for (const market of input.markets) {
    if (!market.gammaMarketId || !market.conditionId || !market.clobTokenIds) {
      return "Invalid market data";
    }
    if (ids.has(market.gammaMarketId)) return "Duplicate markets are not allowed";
    ids.add(market.gammaMarketId);

    if (market.side !== "yes" && market.side !== "no") {
      return "Each market needs a YES or NO side";
    }

    const weight = Number(market.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return "Each market weight must be greater than 0";
    }
    totalWeight += weight;
  }

  if (totalWeight !== 100) return "Market weights must total 100%";
  return null;
}

function validateAddress(address: string | undefined): string | null {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return "Connect your wallet to publish";
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
    validateCreateInput(input) ?? validateAddress(input.managerAddress);
  if (error) throw new Error(error);

  const slug = await uniqueSlug(slugify(input.name.trim()));

  const createdAt = new Date().toISOString();
  const [markets, manager] = await Promise.all([
    captureCreationPrices(
      input.markets.map(toMarketPosition),
      new Date(createdAt),
    ),
    resolveManager(input.managerAddress),
  ]);

  const fund: Fund = {
    id: randomUUID(),
    slug,
    name: input.name.trim(),
    description: input.thesis.trim().slice(0, 120),
    thesis: input.thesis.trim(),
    status: "trading",
    manager,
    markets,
    createdAt,
  };

  await writeUserFund(fund);
  return fund;
}
