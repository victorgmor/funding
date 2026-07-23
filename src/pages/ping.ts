import type { APIRoute } from "astro";

/** ECS Express ALB health check (default path). */
export const GET: APIRoute = () =>
  new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

export const prerender = false;
