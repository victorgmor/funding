import type { APIRoute } from "astro";
import { runPendingTradesForFund } from "@/lib/funds/run-pending-trades";
import { getFund } from "@/lib/funds/store";
import { serverSigningEnabled } from "@/lib/privy/server";

export const prerender = false;

/** Execute pending fan-out slices via Privy session signer (server-side). */
export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  if (!serverSigningEnabled()) {
    return new Response(JSON.stringify({ error: "Server signing not configured" }), {
      status: 503,
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    address?: string;
  };
  const address = body.address?.trim()?.toLowerCase();

  try {
    const results = await runPendingTradesForFund(fund.slug, address);
    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Execution failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
