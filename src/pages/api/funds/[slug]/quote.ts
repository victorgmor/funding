import type { APIRoute } from "astro";
import { getFund } from "@/lib/funds/store";
import { buildBuyQuote, buildExitQuote } from "@/lib/polymarket/quote";

export const prerender = false;

export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const body = (await request.json()) as {
    action: "buy" | "exit";
    amount?: number;
    address?: string;
  };

  try {
    if (body.action === "buy") {
      const amount = Number(body.amount);
      if (!amount || amount < 5) {
        return new Response(
          JSON.stringify({ error: "Minimum $5 USDC per basket" }),
          { status: 400 },
        );
      }
      const quote = await buildBuyQuote(fund, amount);
      return new Response(JSON.stringify(quote), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.action === "exit") {
      if (!body.address) {
        return new Response(JSON.stringify({ error: "Wallet required" }), {
          status: 400,
        });
      }
      const quote = await buildExitQuote(fund, body.address);
      return new Response(JSON.stringify(quote), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Quote failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
