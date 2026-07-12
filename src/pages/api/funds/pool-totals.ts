import type { APIRoute } from "astro";
import { totalPoolNotional } from "@/lib/funds/fanout";
import { listMandatesByFund } from "@/lib/funds/mandates";
import { getAllFunds } from "@/lib/funds/store";

export const GET: APIRoute = async () => {
  try {
    const funds = await getAllFunds();
    const entries = await Promise.all(
      funds.map(async (fund) => {
        const mandates = await listMandatesByFund(fund.slug);
        return [fund.slug, totalPoolNotional(mandates)] as const;
      }),
    );

    return new Response(JSON.stringify(Object.fromEntries(entries)), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load pool totals";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
