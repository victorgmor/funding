import type { APIRoute } from "astro";
import { reconcileMandatePositions } from "@/lib/funds/mandate-reconcile";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import { listMandatesForInvestor } from "@/lib/funds/mandates";
import { getFund } from "@/lib/funds/store";
import {
  fetchTokenValuations,
  resolveDepositAddresses,
} from "@/lib/funds/valuation";
import type { Fund, Mandate } from "@/lib/funds/types";

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
      let healed = mandate;
      try {
        const positions = await reconcileMandatePositions(fund.slug, mandate.id);
        const filledTrades = (await listTradesByFund(fund.slug)).filter(
          (trade) =>
            trade.mandateId === mandate.id && trade.status === "filled",
        );
        const depositByInvestor = await resolveDepositAddresses(fund.slug, [
          address,
        ]);
        const valuations = await fetchTokenValuations(
          positions,
          depositByInvestor,
          filledTrades,
        );
        const { liveMandateBooks, healMandateFromLive } = await import(
          "@/lib/funds/live-mandate"
        );
        const live = await liveMandateBooks(
          mandate,
          filledTrades,
          depositByInvestor.get(address.toLowerCase()),
          valuations,
        );
        if (live) {
          healed = await healMandateFromLive(mandate, live);
          mandateProfitUsdc = live.profitUsdc;
        }
      } catch {
        mandateProfitUsdc = null;
      }

      entries.push({ fund, mandate: healed, mandateProfitUsdc });
    }

    return new Response(JSON.stringify({ mandates: entries }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mandate list failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
