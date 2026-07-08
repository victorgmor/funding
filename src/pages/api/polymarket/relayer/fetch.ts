import type { APIRoute } from "astro";

export const prerender = false;

const RELAYER_URL = "https://relayer-v2.polymarket.com";
const ALLOWED = new Set(["nonce", "relay-payload", "address"]);

export const GET: APIRoute = async ({ url }) => {
  const endpoint = url.searchParams.get("endpoint")?.trim();
  if (!endpoint || !ALLOWED.has(endpoint)) {
    return new Response(JSON.stringify({ error: "Invalid relayer endpoint" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams(url.searchParams);
  params.delete("endpoint");

  const res = await fetch(`${RELAYER_URL}/${endpoint}?${params}`);
  const body = await res.text();

  return new Response(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
