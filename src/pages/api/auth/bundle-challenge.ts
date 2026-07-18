import type { APIRoute } from "astro";
import {
  createBundleChallenge,
  type BundleAuthAction,
} from "@/lib/auth/bundle-auth";

export const prerender = false;

const ACTIONS = new Set<BundleAuthAction>([
  "publish",
  "manage",
  "close",
  "commit",
  "instruct",
  "authorize",
  "unarchive",
]);

export const GET: APIRoute = async ({ request, url }) => {
  const address = url.searchParams.get("address");
  const action = url.searchParams.get("action") as BundleAuthAction | null;
  const slug = url.searchParams.get("slug") ?? undefined;

  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!action || !ACTIONS.has(action)) {
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const host = new URL(request.url).host;
    const challenge = await createBundleChallenge(host, address, action, slug);
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
