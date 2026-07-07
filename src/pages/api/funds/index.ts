import type { APIRoute } from "astro";
import { createFund, getAllFunds, type CreateFundInput } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(await getAllFunds()), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: CreateFundInput;
  try {
    body = (await request.json()) as CreateFundInput;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const fund = await createFund(body);
    return new Response(JSON.stringify(fund), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create fund";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
