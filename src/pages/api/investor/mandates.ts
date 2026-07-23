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

    // Each mandate is independent — run them in parallel instead of a
    // sequential reconcile → trades → valuations chain per mandate.
    const entries = (
      await Promise.all(
        mandates.map(async (mandate): Promise<MandateEntry | null> => {
          const fund = await getFund(mandate.fundSlug);
          if (!fund) return null;

          let mandateProfitUsdc: number | null = null;
          let healed = mandate;
          try {
            const [positions, allTrades, depositByInvestor] =
              await Promise.all([
                reconcileMandatePositions(fund.slug, mandate.id),
                listTradesByFund(fund.slug),
                resolveDepositAddresses(fund.slug, [address]),
              ]);
            const filledTrades = allTrades.filter(
              (trade) =>
                trade.mandateId === mandate.id && trade.status === "filled",
            );
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

          return { fund, mandate: healed, mandateProfitUsdc };
        }),
      )
    ).filter((entry): entry is MandateEntry => entry != null);

    return new Response(JSON.stringify({ mandates: entries }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mandate list failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
