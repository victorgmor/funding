import type { APIRoute } from "astro";
import { isFundOwnerWallet } from "@/lib/funds/access";
import {
  buildVirtualPool,
  maskMandateWallet,
  redactPoolForInvestor,
} from "@/lib/funds/pool";
import { listPositionsByFund } from "@/lib/funds/mandate-positions";
import { computeFundPoolPerformance } from "@/lib/funds/performance";
import { enrichTradesWithPnl } from "@/lib/funds/valuation";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address") ?? undefined;
  const isOwner = isFundOwnerWallet(fund, address);

  try {
    let pool = await buildVirtualPool(fund);
    const depositors = pool.mandates
      .filter((mandate) => mandate.status === "active" && mandate.notionalUsdc > 0)
      .map((mandate) => ({
        ...maskMandateWallet(mandate),
        profileId: mandate.investorWallet,
      }))
      .sort(
        (a, b) =>
          (b.depositedUsdc ?? b.notionalUsdc) -
          (a.depositedUsdc ?? a.notionalUsdc),
      );

    if (isOwner) {
      pool = {
        ...pool,
        mandates: pool.mandates.map(maskMandateWallet),
      };
    } else if (address) {
      pool = redactPoolForInvestor(pool, address);
    } else {
      pool = {
        ...pool,
        mandates: [],
      };
    }

    const performance = await computeFundPoolPerformance(fund);
    const positions = await listPositionsByFund(fund.slug);
    const recentTrades = await enrichTradesWithPnl(
      fund.slug,
      pool.recentTrades,
      positions,
    );

    return new Response(
      JSON.stringify({ ...pool, depositors, recentTrades, performance }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pool read failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
