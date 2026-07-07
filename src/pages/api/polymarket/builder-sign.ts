import type { APIRoute } from "astro";
import { getRelayBuilderConfig } from "@/lib/polymarket/builder-server";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const builder = getRelayBuilderConfig();
  if (!builder) {
    return new Response(JSON.stringify({ error: "Builder not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = (await request.json()) as {
    method?: string;
    path?: string;
    body?: string;
    timestamp?: number;
  };

  if (!payload.method || !payload.path) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = await builder.generateBuilderHeaders(
    payload.method,
    payload.path,
    payload.body,
    payload.timestamp,
  );

  if (!headers) {
    return new Response(JSON.stringify({ error: "Could not sign request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(headers), {
    headers: { "Content-Type": "application/json" },
  });
};
