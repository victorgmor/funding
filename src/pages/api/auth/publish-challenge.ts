import type { APIRoute } from "astro";
import { createPublishChallenge } from "@/lib/auth/publish-challenge";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const address = url.searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const host = new URL(request.url).host;
    const challenge = createPublishChallenge(host, address);
    return new Response(JSON.stringify(challenge), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create challenge";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
