import type { APIRoute } from "astro";
import { totalPoolNotional } from "@/lib/funds/fanout";
import { computeFundPoolPerformance } from "@/lib/funds/performance";
import { listMandatesByFund } from "@/lib/funds/mandates";
import { getAllFunds } from "@/lib/funds/store";

export const prerender = false;

export type PoolTotalEntry = {
  deposited: number;
  profitUsdc: number | null;
  roiPct: number | null;
};

export const GET: APIRoute = async () => {
  try {
    const funds = await getAllFunds();
    const entries = await Promise.all(
      funds.map(async (fund) => {
        const mandates = await listMandatesByFund(fund.slug);
        const deposited = totalPoolNotional(mandates);
        const performance = await computeFundPoolPerformance(fund);
        return [
          fund.slug,
          {
            deposited,
            profitUsdc: performance?.profitUsdc ?? null,
            roiPct: performance?.roi ?? null,
          },
        ] as const;
      }),
    );

    return new Response(JSON.stringify(Object.fromEntries(entries)), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load pool totals";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
