import type { APIRoute } from "astro";
import { resolvePolymarketSearch } from "@/lib/polymarket/gamma";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return new Response(JSON.stringify({ markets: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const markets = await resolvePolymarketSearch(q);
    return new Response(JSON.stringify({ markets }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Search failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
