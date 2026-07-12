import type { APIRoute } from "astro";
import { settleMandateTrade } from "@/lib/funds/execute-trades";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

/** Investor marks a pending fan-out slice as filled or failed after wallet execution. */
export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const body = (await request.json()) as {
    address?: string;
    tradeId?: string;
    status?: "filled" | "failed";
    detail?: string;
  };

  try {
    const address = body.address?.trim()?.toLowerCase();
    if (!address) {
      return new Response(JSON.stringify({ error: "Wallet required" }), {
        status: 400,
      });
    }

    if (body.status !== "filled" && body.status !== "failed") {
      return new Response(JSON.stringify({ error: "Invalid status" }), {
        status: 400,
      });
    }

    const trades = await listTradesByFund(fund.slug);
    const trade = trades.find((row) => row.id === body.tradeId);
    if (!trade) {
      return new Response(JSON.stringify({ error: "Trade not found" }), {
        status: 404,
      });
    }

    if (trade.investorWallet !== address) {
      return new Response(JSON.stringify({ error: "Not your trade" }), {
        status: 403,
      });
    }

    if (trade.status !== "pending") {
      return new Response(JSON.stringify({ error: "Trade already settled" }), {
        status: 400,
      });
    }

    if (body.status === "failed") {
      /* cash restored inside settleMandateTrade */
    }

    const updated = await settleMandateTrade(
      fund.slug,
      trade,
      body.status,
      body.detail,
    );

    return new Response(JSON.stringify({ trade: updated }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address")?.toLowerCase();
  const pendingOnly = url.searchParams.get("pending") === "1";

  try {
    let trades = await listTradesByFund(fund.slug);

    if (address) {
      trades = trades.filter((t) => t.investorWallet === address);
    }
    if (pendingOnly) {
      trades = trades.filter((t) => t.status === "pending");
    }

    return new Response(JSON.stringify({ trades }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Read failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
