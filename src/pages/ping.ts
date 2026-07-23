import type { APIRoute } from "astro";

/** Lightweight ALB health + deploy verify (returns BUILD_SHA when set). */
export const GET: APIRoute = () =>
  new Response(process.env.BUILD_SHA?.trim() || "ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export const prerender = false;
