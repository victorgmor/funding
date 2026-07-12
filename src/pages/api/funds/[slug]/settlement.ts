import type { APIRoute } from "astro";
import { getFundSettlement } from "@/lib/funds/settlement";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  try {
    const settlement = await getFundSettlement(fund.slug);
    return new Response(JSON.stringify({ settlement: settlement ?? null }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Settlement read failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
