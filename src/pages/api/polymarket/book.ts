import type { APIRoute } from "astro";
import { createTtlCache } from "@/lib/cache/ttl";

export const prerender = false;

type BookLevel = { price: string; size: string };
type OrderBook = {
  bids: BookLevel[];
  asks: BookLevel[];
  tick_size?: string;
  last_trade_price?: string;
};

const bookCache = createTtlCache<OrderBook>(2_000);

export const GET: APIRoute = async ({ url }) => {
  const tokenId = url.searchParams.get("token_id")?.trim();
  if (!tokenId) {
    return new Response(JSON.stringify({ error: "token_id required" }), {
      status: 400,
    });
  }

  try {
    const book = await bookCache.getOrSet(tokenId, async () => {
      const res = await fetch(
        `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
      );
      if (!res.ok) throw new Error(`Orderbook unavailable (${res.status})`);
      return (await res.json()) as OrderBook;
    });

    return new Response(JSON.stringify(book), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=2",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Orderbook failed";
    return new Response(JSON.stringify({ error: message }), { status: 502 });
  }
};
