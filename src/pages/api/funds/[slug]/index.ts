import type { APIRoute } from "astro";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const fund = getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }
  return new Response(JSON.stringify(fund), {
    headers: { "Content-Type": "application/json" },
  });
};
