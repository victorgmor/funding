import type { APIRoute } from "astro";
import { reconcileMandatePositions } from "@/lib/funds/mandate-reconcile";
import { listMandatesForInvestor } from "@/lib/funds/mandates";
import { getFund } from "@/lib/funds/store";
import type { Fund, Mandate } from "@/lib/funds/types";
import { fetchTokenMidPrices } from "@/lib/polymarket/clob-prices";

export const prerender = false;

type MandateEntry = {
  fund: Fund;
  mandate: Mandate;
  mandateProfitUsdc: number | null;
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

    for (const mandate of mandates) {
      const fund = await getFund(mandate.fundSlug);
      if (!fund) continue;

      let mandateProfitUsdc: number | null = null;
      try {
        const positions = await reconcileMandatePositions(fund.slug, mandate.id);
        const mids = await fetchTokenMidPrices(positions.map((p) => p.tokenId));
        const positionsValue = positions.reduce(
          (sum, pos) => sum + pos.shares * (mids.get(pos.tokenId) ?? pos.avgPrice),
          0,
        );
        const mandateValueUsdc =
          Math.round((mandate.cashUsdc + positionsValue) * 100) / 100;
        mandateProfitUsdc =
          Math.round((mandateValueUsdc - mandate.notionalUsdc) * 100) / 100;
      } catch {
        mandateProfitUsdc = null;
      }

      entries.push({ fund, mandate, mandateProfitUsdc });
    }

    return new Response(JSON.stringify({ mandates: entries }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mandate list failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
