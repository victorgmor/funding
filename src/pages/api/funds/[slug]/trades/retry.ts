import type { APIRoute } from "astro";
import { isFundOwnerWallet } from "@/lib/funds/access";
import { requeueFailedTrade } from "@/lib/funds/mandate-trades";
import { buildVirtualPool, poolTradingOpen } from "@/lib/funds/pool";
import { runPendingTradesForFund } from "@/lib/funds/run-pending-trades";
import { getFund } from "@/lib/funds/store";
import { serverSigningEnabled } from "@/lib/privy/server";

export const prerender = false;

/** Manager requeues a failed fan-out slice and runs it again. */
export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  if (!serverSigningEnabled()) {
    return new Response(
      JSON.stringify({ error: "Server signing not configured" }),
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    address?: string;
    tradeId?: string;
  };
  const address = body.address?.trim()?.toLowerCase();
  const tradeId = body.tradeId?.trim();

  if (!address || !isFundOwnerWallet(fund, address)) {
    return new Response(JSON.stringify({ error: "Manager only" }), {
      status: 403,
    });
  }
  if (!tradeId) {
    return new Response(JSON.stringify({ error: "Trade required" }), {
      status: 400,
    });
  }

  try {
    const pool = await buildVirtualPool(fund);
    if (!poolTradingOpen(fund, pool.totalNotional)) {
      return new Response(JSON.stringify({ error: "Trading is closed" }), {
        status: 400,
      });
    }

    const trade = await requeueFailedTrade(fund.slug, tradeId);
    const { results, redeems } = await runPendingTradesForFund(
      fund.slug,
      trade.investorWallet,
    );

    return new Response(JSON.stringify({ trade, results, redeems }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Retry failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
