import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import { upsertMandateCommitment, getMandate } from "@/lib/funds/mandates";
import {
  buildVirtualPool,
  poolCapRemaining,
  poolRaiseOpen,
} from "@/lib/funds/pool";
import { getFund } from "@/lib/funds/store";
import { readDepositWalletBalanceUsdc } from "@/lib/polymarket/deposit-balance";
import { getMandateSettlement } from "@/lib/funds/settlement";
import { reconcileMandatePositions } from "@/lib/funds/mandate-reconcile";
import { getTradingSession } from "@/lib/funds/trading-sessions";
import { fetchTokenMidPrices } from "@/lib/polymarket/clob-prices";
import { serverSigningEnabled } from "@/lib/privy/server";

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
    const pool = await buildVirtualPool(fund);
    const mandate = pool.mandates.find(
      (m) => m.investorWallet === address.toLowerCase(),
    );

    let depositBalanceUsdc: number | null = null;
    try {
      depositBalanceUsdc = await readDepositWalletBalanceUsdc(
        address as `0x${string}`,
      );
    } catch {
      depositBalanceUsdc = null;
    }

    const [positions, session, mandateSettlement] = await Promise.all([
      mandate
        ? reconcileMandatePositions(fund.slug, mandate.id)
        : Promise.resolve([]),
      getTradingSession(fund.slug, address),
      fund.status === "closed"
        ? getMandateSettlement(fund.slug, address)
        : Promise.resolve(undefined),
    ]);

    let mandateValueUsdc: number | null = null;
    let mandateProfitUsdc: number | null = null;
    if (mandate) {
      const mids = await fetchTokenMidPrices(positions.map((p) => p.tokenId));
      const positionsValue = positions.reduce(
        (sum, pos) => sum + pos.shares * (mids.get(pos.tokenId) ?? pos.avgPrice),
        0,
      );
      mandateValueUsdc =
        Math.round((mandate.cashUsdc + positionsValue) * 100) / 100;
      mandateProfitUsdc =
        Math.round((mandateValueUsdc - mandate.notionalUsdc) * 100) / 100;
    }

    return new Response(
      JSON.stringify({
        fundSlug: fund.slug,
        mandate: mandate ?? null,
        mandateValueUsdc,
        mandateProfitUsdc,
        totalNotional: pool.totalNotional,
        capRemaining: poolCapRemaining(fund, pool.totalNotional),
        raiseOpen: poolRaiseOpen(fund),
        depositBalanceUsdc,
        positions,
        session: session ?? null,
        serverSigningEnabled: serverSigningEnabled(),
        mandateSettlement: mandateSettlement ?? null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mandate read failed";
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
    amountUsdc?: number;
    message?: string;
    signature?: `0x${string}`;
  };

  try {
    if (fund.status === "closed") {
      return new Response(JSON.stringify({ error: "Fund is closed" }), {
        status: 400,
      });
    }

    if (!poolRaiseOpen(fund)) {
      return new Response(JSON.stringify({ error: "Raise window is closed" }), {
        status: 400,
      });
    }

    const address = body.address?.trim();
    if (!address) {
      return new Response(JSON.stringify({ error: "Wallet required" }), {
        status: 400,
      });
    }

    const amountUsdc = Number(body.amountUsdc);
    if (!amountUsdc || amountUsdc < 5) {
      return new Response(
        JSON.stringify({ error: "Minimum $5 commitment" }),
        { status: 400 },
      );
    }

    const authError = await verifyBundleSignature({
      message: body.message ?? "",
      signature: body.signature ?? "0x",
      managerAddress: address,
      action: "commit",
      slug: fund.slug,
    });
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), { status: 401 });
    }

    const pool = await buildVirtualPool(fund);
    const capRemaining = poolCapRemaining(fund, pool.totalNotional);
    if (capRemaining != null && amountUsdc > capRemaining) {
      return new Response(
        JSON.stringify({
          error: `Pool cap exceeded — $${capRemaining.toFixed(2)} remaining`,
        }),
        { status: 400 },
      );
    }

    const existing = await getMandate(fund.slug, address);
    const nextNotional = (existing?.notionalUsdc ?? 0) + amountUsdc;

    let depositBalanceUsdc: number;
    try {
      depositBalanceUsdc = await readDepositWalletBalanceUsdc(
        address as `0x${string}`,
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not read deposit wallet balance";
      return new Response(JSON.stringify({ error: message }), { status: 502 });
    }

    if (depositBalanceUsdc < nextNotional) {
      return new Response(
        JSON.stringify({
          error: `Deposit wallet has $${depositBalanceUsdc.toFixed(2)} pUSD — need $${nextNotional.toFixed(2)} to back this mandate`,
        }),
        { status: 400 },
      );
    }

    const mandate = await upsertMandateCommitment(
      fund.slug,
      address,
      amountUsdc,
    );

    return new Response(JSON.stringify({ mandate }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Commit failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
