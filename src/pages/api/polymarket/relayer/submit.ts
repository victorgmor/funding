import type { APIRoute } from "astro";
import { getRelayBuilderConfig } from "@/lib/polymarket/builder-server";

export const prerender = false;

const RELAYER_URL = "https://relayer-v2.polymarket.com";

export const POST: APIRoute = async ({ request }) => {
  const builder = getRelayBuilderConfig();
  if (!builder) {
    return new Response(JSON.stringify({ error: "Builder not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.text();
  const method = "POST";
  const path = "/submit";
  const headers = await builder.generateBuilderHeaders(
    method,
    path,
    body,
    Date.now(),
  );

  if (!headers) {
    return new Response(JSON.stringify({ error: "Could not sign request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetch(`${RELAYER_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });

  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
