import type { APIRoute } from "astro";
import { runRedemptionsForFund } from "@/lib/funds/redeem-positions";
import { getAllFunds } from "@/lib/funds/store";
import { serverSigningEnabled } from "@/lib/privy/server";

export const prerender = false;

/** Redeem resolved positions for every fund — call from a scheduler (EventBridge, cron). */
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!serverSigningEnabled()) {
    return new Response(JSON.stringify({ error: "Server signing not configured" }), {
      status: 503,
    });
  }

  try {
    const funds = await getAllFunds();
    const redeems = [];

    for (const fund of funds) {
      const runs = await runRedemptionsForFund(fund.slug);
      for (const run of runs) {
        redeems.push({ ...run, fundSlug: fund.slug });
      }
    }

    return new Response(JSON.stringify({ redeems }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Redemption sweep failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
