import type { APIRoute } from "astro";
import { canAccessFund } from "@/lib/funds/access";
import { getFund } from "@/lib/funds/store";
import { fetchLiveMarkets } from "@/lib/polymarket/gamma";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address")?.trim();
  if (!(await canAccessFund(fund, address))) {
    return new Response(JSON.stringify({ error: "Unlock this bundle first" }), {
      status: 403,
    });
  }

  try {
    const markets = await fetchLiveMarkets(fund.markets);
    return new Response(
      JSON.stringify({ fundSlug: fund.slug, markets, updatedAt: new Date().toISOString() }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch markets";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
