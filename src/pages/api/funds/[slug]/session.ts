import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import {
  getTradingSession,
  revokeTradingSession,
  saveTradingSession,
} from "@/lib/funds/trading-sessions";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  try {
    const session = await getTradingSession(fund.slug, address);
    return new Response(JSON.stringify({ session: session ?? null }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Session read failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const body = (await request.json()) as {
    address?: string;
    message?: string;
    signature?: `0x${string}`;
    depositAddress?: string;
    signatureType?: number;
    creds?: { key?: string; secret?: string; passphrase?: string };
  };

  try {
    const address = body.address?.trim();
    if (!address) {
      return new Response(JSON.stringify({ error: "Wallet required" }), {
        status: 400,
      });
    }

    const authError = await verifyBundleSignature({
      message: body.message ?? "",
      signature: body.signature ?? "0x",
      managerAddress: address,
      action: "authorize",
      slug: fund.slug,
    });
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), { status: 401 });
    }

    if (!body.depositAddress || !body.creds?.key || !body.creds.secret || !body.creds.passphrase) {
      return new Response(JSON.stringify({ error: "Trading credentials required" }), {
        status: 400,
      });
    }

    const session = await saveTradingSession({
      fundSlug: fund.slug,
      investorWallet: address,
      depositAddress: body.depositAddress,
      signatureType: Number(body.signatureType ?? 2),
      creds: {
        key: body.creds.key,
        secret: body.creds.secret,
        passphrase: body.creds.passphrase,
      },
    });

    return new Response(JSON.stringify({ session }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Session save failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, url }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const address = url.searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Wallet required" }), {
      status: 400,
    });
  }

  try {
    await revokeTradingSession(fund.slug, address);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Revoke failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
