import type { APIRoute } from "astro";
import { createTtlCache } from "@/lib/cache/ttl";
import { resolvePolymarketSearch } from "@/lib/polymarket/gamma";

export const prerender = false;

const SEARCH_TTL_MS = 30_000;
const searchCache = createTtlCache<string>(SEARCH_TTL_MS);

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return new Response(JSON.stringify({ markets: [] }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  }

  try {
    const key = q.toLowerCase();
    const body = await searchCache.getOrSet(key, async () => {
      const markets = await resolvePolymarketSearch(q);
      return JSON.stringify({ markets });
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
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
