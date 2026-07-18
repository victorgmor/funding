import type { APIRoute } from "astro";
import { createTtlCache } from "@/lib/cache/ttl";
import { computePoolTotalsBySlug } from "@/lib/funds/performance";
import { getAllFunds } from "@/lib/funds/store";

export const prerender = false;

export type { PoolTotalEntry } from "@/lib/funds/performance";

const RESPONSE_TTL_MS = 30_000;
const responseCache = createTtlCache<string>(RESPONSE_TTL_MS);

export const GET: APIRoute = async () => {
  try {
    const body = await responseCache.getOrSet("all", async () => {
      const funds = await getAllFunds();
      const totals = await computePoolTotalsBySlug(funds);
      return JSON.stringify(totals);
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load pool totals";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
