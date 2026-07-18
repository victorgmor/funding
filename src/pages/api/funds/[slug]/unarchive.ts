import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import { getFund, unarchiveFund, type CloseFundInput } from "@/lib/funds/store";

export const prerender = false;

const FORBIDDEN = "Only the fund creator can restore this fund";

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.slug!;
  let body: CloseFundInput;

  try {
    body = (await request.json()) as CloseFundInput;
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
    action: "unarchive",
    slug,
  });
  if (authError) {
    return new Response(JSON.stringify({ error: authError }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const existing = await getFund(slug);
    if (!existing) {
      return new Response(JSON.stringify({ error: "Fund not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (
      existing.manager.id.toLowerCase() !== body.managerAddress.toLowerCase()
    ) {
      return new Response(JSON.stringify({ error: FORBIDDEN }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fund = await unarchiveFund(slug);
    return new Response(JSON.stringify(fund), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not restore fund";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
