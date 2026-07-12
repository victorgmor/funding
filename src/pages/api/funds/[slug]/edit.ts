import type { APIRoute } from "astro";
import { getFund, isUserFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const fund = await getFund(params.slug!);
  if (!fund || !isUserFund(fund)) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  return new Response(
    JSON.stringify({
      slug: fund.slug,
      name: fund.name,
      thesis: fund.thesis,
      status: fund.status,
      managerId: fund.manager.id,
      unlockPriceUsdc: fund.unlockPriceUsdc ?? null,
      capUsdc: fund.capUsdc ?? null,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
