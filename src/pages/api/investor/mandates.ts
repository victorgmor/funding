import type { APIRoute } from "astro";
import { reconcileMandatePositions } from "@/lib/funds/mandate-reconcile";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import { listMandatesForInvestor } from "@/lib/funds/mandates";
import { getFund } from "@/lib/funds/store";
import {
  fetchTokenValuations,
  mandateMarkValue,
  resolveDepositAddresses,
} from "@/lib/funds/valuation";
import type { Fund, Mandate } from "@/lib/funds/types";

export const prerender = false;

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

type MandateEntry = {
  fund: Fund;
  mandate: Mandate;
  mandateProfitUsdc: number | null;
};

type DayActivity = {
  date: string;
  value: number;
  fundSlug: string;
};

export const GET: APIRoute = async ({ url }) => {
  const address = url.searchParams.get("address")?.trim();
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  try {
    const mandates = await listMandatesForInvestor(address);
    const entries: MandateEntry[] = [];
    const activity: DayActivity[] = [];

    for (const mandate of mandates) {
      const fund = await getFund(mandate.fundSlug);
      if (!fund) continue;

      let mandateProfitUsdc: number | null = null;
      try {
        const positions = await reconcileMandatePositions(fund.slug, mandate.id);
        const filledTrades = (await listTradesByFund(fund.slug)).filter(
          (trade) =>
            trade.mandateId === mandate.id && trade.status === "filled",
        );
        for (const trade of filledTrades) {
          const date = (trade.filledAt ?? trade.createdAt).slice(0, 10);
          const value = Math.abs(trade.pnlUsdc ?? trade.usdcAmount ?? 1);
          activity.push({ date, value, fundSlug: fund.slug });
        }
        const depositByInvestor = await resolveDepositAddresses(fund.slug, [
          address,
        ]);
        const valuations = await fetchTokenValuations(
          positions,
          depositByInvestor,
          filledTrades,
        );
        const mandateValueUsdc = mandateMarkValue(
          mandate,
          positions,
          valuations,
          filledTrades,
        );
        mandateProfitUsdc = round(mandateValueUsdc - mandate.notionalUsdc, 2);
      } catch {
        mandateProfitUsdc = null;
      }

      entries.push({ fund, mandate, mandateProfitUsdc });
    }

    return new Response(JSON.stringify({ mandates: entries, activity }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mandate list failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
