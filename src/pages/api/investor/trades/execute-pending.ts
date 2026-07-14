import type { APIRoute } from "astro";
import { runRedemptionsForInvestor } from "@/lib/funds/redeem-positions";
import { runPendingTradesForInvestor } from "@/lib/funds/run-pending-trades";
import { serverSigningEnabled } from "@/lib/privy/server";

export const prerender = false;

/** Execute pending trades and redeem resolved positions for an investor (any fund). */
export const POST: APIRoute = async ({ request }) => {
  if (!serverSigningEnabled()) {
    return new Response(JSON.stringify({ error: "Server signing not configured" }), {
      status: 503,
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    address?: string;
  };
  const address = body.address?.trim()?.toLowerCase();
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  try {
    const [results, redeems] = await Promise.all([
      runPendingTradesForInvestor(address),
      runRedemptionsForInvestor(address),
    ]);
    return new Response(JSON.stringify({ results, redeems }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Execution failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
