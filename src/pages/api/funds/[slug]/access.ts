import type { APIRoute } from "astro";
import {
  canAccessFund,
  fundUnlockPrice,
  isPaidFund,
} from "@/lib/funds/access";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address")?.trim();
  const paid = isPaidFund(fund);
  const access = await canAccessFund(fund, address);

  return new Response(
    JSON.stringify({
      access,
      paid,
      priceUsdc: paid ? fundUnlockPrice(fund) : null,
      owner: Boolean(
        address &&
          address.toLowerCase() === fund.manager.id.toLowerCase(),
      ),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
