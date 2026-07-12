import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { demoMemory, ensureDemoMemory } from "@/lib/demo/memory";
import { useDemoStore } from "@/lib/demo/mode";
import type { Fund, Mandate, MandatePosition } from "@/lib/funds/types";
import { listMandatesByFund, setMandateStatus } from "@/lib/funds/mandates";
import { listPositionsByFund } from "@/lib/funds/mandate-positions";
import {
  mandateDocClient,
  mandateSk,
  mandatesTableName,
} from "@/lib/funds/mandate-db";
import { fetchTokenMidPrices } from "@/lib/polymarket/clob-prices";

export type MandateSettlement = {
  mandateId: string;
  investorWallet: string;
  notionalUsdc: number;
  cashUsdc: number;
  positionsValueUsdc: number;
  finalValueUsdc: number;
  profitUsdc: number;
  managerShareUsdc: number;
  investorProfitUsdc: number;
};

export type FundSettlement = {
  fundSlug: string;
  managerWallet: string;
  managerProfitSharePct: number;
  mandates: MandateSettlement[];
  totalProfitUsdc: number;
  totalManagerShareUsdc: number;
  settledAt: string;
};

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function mandatePositionsValue(
  mandate: Mandate,
  positions: MandatePosition[],
  mids: Map<string, number>,
): number {
  let total = 0;
  for (const pos of positions.filter((p) => p.mandateId === mandate.id)) {
    const mark = mids.get(pos.tokenId) ?? pos.avgPrice;
    total += pos.shares * mark;
  }
  return round(total, 2);
}

function settleMandate(
  mandate: Mandate,
  positions: MandatePosition[],
  mids: Map<string, number>,
  managerProfitSharePct: number,
): MandateSettlement {
  const positionsValueUsdc = mandatePositionsValue(mandate, positions, mids);
  const finalValueUsdc = round(mandate.cashUsdc + positionsValueUsdc, 2);
  const profitUsdc = round(Math.max(0, finalValueUsdc - mandate.notionalUsdc), 2);
  const managerShareUsdc = round(
    profitUsdc * (managerProfitSharePct / 100),
    2,
  );
  const investorProfitUsdc = round(profitUsdc - managerShareUsdc, 2);

  return {
    mandateId: mandate.id,
    investorWallet: mandate.investorWallet,
    notionalUsdc: mandate.notionalUsdc,
    cashUsdc: mandate.cashUsdc,
    positionsValueUsdc,
    finalValueUsdc,
    profitUsdc,
    managerShareUsdc,
    investorProfitUsdc,
  };
}

export async function settleFund(fund: Fund): Promise<FundSettlement> {
  const existing = await getFundSettlement(fund.slug);
  if (existing) return existing;

  const pct = fund.managerProfitSharePct ?? 0;
  const mandates = await listMandatesByFund(fund.slug);
  const positions = await listPositionsByFund(fund.slug);
  const tokenIds = positions.map((p) => p.tokenId);
  const mids = await fetchTokenMidPrices(tokenIds);

  const mandateSettlements = mandates.map((mandate) =>
    settleMandate(mandate, positions, mids, pct),
  );

  const totalProfitUsdc = round(
    mandateSettlements.reduce((sum, row) => sum + row.profitUsdc, 0),
    2,
  );
  const totalManagerShareUsdc = round(
    mandateSettlements.reduce((sum, row) => sum + row.managerShareUsdc, 0),
    2,
  );

  const settlement: FundSettlement = {
    fundSlug: fund.slug,
    managerWallet: fund.manager.id,
    managerProfitSharePct: pct,
    mandates: mandateSettlements,
    totalProfitUsdc,
    totalManagerShareUsdc,
    settledAt: new Date().toISOString(),
  };

  await saveFundSettlement(settlement);

  for (const mandate of mandates) {
    await setMandateStatus(fund.slug, mandate.investorWallet, "closed");
  }

  return settlement;
}

export async function getFundSettlement(
  fundSlug: string,
): Promise<FundSettlement | undefined> {
  if (useDemoStore()) {
    ensureDemoMemory();
    return demoMemory.settlements.get(fundSlug);
  }

  const row = await mandateDocClient().send(
    new GetCommand({
      TableName: mandatesTableName(),
      Key: {
        fundSlug,
        sk: mandateSk("settlement", fundSlug),
      },
    }),
  );

  return row.Item?.settlement as FundSettlement | undefined;
}

async function saveFundSettlement(settlement: FundSettlement): Promise<void> {
  if (useDemoStore()) {
    ensureDemoMemory();
    demoMemory.settlements.set(settlement.fundSlug, settlement);
    return;
  }

  await mandateDocClient().send(
    new PutCommand({
      TableName: mandatesTableName(),
      Item: {
        fundSlug: settlement.fundSlug,
        sk: mandateSk("settlement", settlement.fundSlug),
        settlement,
      },
    }),
  );
}

export async function getMandateSettlement(
  fundSlug: string,
  wallet: string,
): Promise<MandateSettlement | undefined> {
  const settlement = await getFundSettlement(fundSlug);
  if (!settlement) return undefined;
  const normalized = wallet.toLowerCase();
  return settlement.mandates.find(
    (row) => row.investorWallet === normalized,
  );
}
