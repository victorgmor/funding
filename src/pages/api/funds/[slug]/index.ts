import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import { getFund, updateFund, type UpdateFundInput } from "@/lib/funds/store";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  let body: UpdateFundInput;

  try {
    body = (await request.json()) as UpdateFundInput;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authError = await verifyBundleSignature({
    message: body.message,
    signature: body.signature,
    managerAddress: body.managerAddress,
    action: "manage",
    slug,
  });
  if (authError) {
    return new Response(JSON.stringify({ error: authError }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const fund = await updateFund(slug, body);
    return new Response(JSON.stringify(fund), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update fund";
    const status = message.includes("not found") ? 404 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const GET: APIRoute = async ({ params }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  return new Response(JSON.stringify(fund), {
    headers: { "Content-Type": "application/json" },
  });
};
