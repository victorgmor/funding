import type { APIRoute } from "astro";

export const prerender = false;

const RELAYER_URL = "https://relayer-v2.polymarket.com";

export const GET: APIRoute = async ({ url }) => {
  const address = url.searchParams.get("address");
  const type = url.searchParams.get("type") ?? "WALLET";

  if (!address) {
    return new Response(JSON.stringify({ error: "address required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = new URLSearchParams({ address, type });
  const res = await fetch(`${RELAYER_URL}/deployed?${params}`);

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Relayer request failed" }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
};
