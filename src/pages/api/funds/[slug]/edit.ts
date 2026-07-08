import type { APIRoute } from "astro";
import { fetchGammaMarket } from "@/lib/polymarket/gamma";
import { getFund, isUserFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const fund = await getFund(params.slug!);
  if (!fund || !isUserFund(fund)) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  try {
    const markets = await Promise.all(
      fund.markets.map(async (market) => {
        const gamma = await fetchGammaMarket(market.gammaMarketId);
        return {
          gammaMarketId: market.gammaMarketId,
          question: market.question,
          conditionId: market.conditionId,
          clobTokenIds: gamma.clobTokenIds,
          outcomes: gamma.outcomes,
          side: market.side,
          weight: market.weight,
        };
      }),
    );

    return new Response(
      JSON.stringify({
        slug: fund.slug,
        name: fund.name,
        thesis: fund.thesis,
        status: fund.status,
        managerId: fund.manager.id,
        unlockPriceUsdc: data.unlockPriceUsdc ?? null,
        markets,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load bundle";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
