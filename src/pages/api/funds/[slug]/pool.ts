import type { APIRoute } from "astro";
import { canAccessFund, isFundOwnerWallet } from "@/lib/funds/access";
import {
  buildVirtualPool,
  maskMandateWallet,
  redactPoolForInvestor,
} from "@/lib/funds/pool";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address") ?? undefined;
  const isOwner = isFundOwnerWallet(fund, address);

  if (!isOwner && !(await canAccessFund(fund, address))) {
    return new Response(JSON.stringify({ error: "Access required" }), {
      status: 403,
    });
  }

  try {
    let pool = await buildVirtualPool(fund);

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
        recentTrades: [],
      };
    }

    return new Response(JSON.stringify(pool), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pool read failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
