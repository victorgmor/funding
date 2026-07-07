import type { APIRoute } from "astro";
import { getFund } from "@/lib/funds/store";
import { buildFundInvestment } from "@/lib/polymarket/quote";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  try {
    const investment = await buildFundInvestment(fund, address);
    const invested = investment.legs.length > 0;
    return new Response(
      JSON.stringify({ invested, fundSlug: fund.slug, investment }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Check failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
