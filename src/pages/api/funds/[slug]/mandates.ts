import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import {
  upsertMandateCommitment,
  reduceMandateCommitment,
  getMandate,
} from "@/lib/funds/mandates";
import {
  buildVirtualPool,
  poolCapRemaining,
  poolRaiseOpen,
} from "@/lib/funds/pool";
import { getFund } from "@/lib/funds/store";
import { readDepositWalletBalanceUsdc } from "@/lib/polymarket/deposit-balance";
import { getMandateSettlement } from "@/lib/funds/settlement";
import { reconcileMandatePositions, investorMandateBacking } from "@/lib/funds/mandate-reconcile";
import { listTradesByFund } from "@/lib/funds/mandate-trades";
import {
  fetchTokenValuations,
  mandateMarkValue,
  resolveDepositAddresses,
} from "@/lib/funds/valuation";
import { getTradingSession, revokeTradingSession } from "@/lib/funds/trading-sessions";
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
      const filledTrades = (await listTradesByFund(fund.slug)).filter(
        (trade) =>
          trade.mandateId === mandate.id && trade.status === "filled",
      );
      const depositByInvestor = await resolveDepositAddresses(fund.slug, [
        address,
      ]);
      const valuations = await fetchTokenValuations(
        positions,
        depositByInvestor.size > 0
          ? depositByInvestor
          : session?.depositAddress
            ? new Map([[address.toLowerCase(), session.depositAddress.toLowerCase()]])
            : undefined,
        filledTrades,
      );
      mandateValueUsdc = mandateMarkValue(
        mandate,
        positions,
        valuations,
        filledTrades,
      );
      mandateProfitUsdc =
        Math.round(
          (mandateValueUsdc -
            (mandate.depositedUsdc ?? mandate.notionalUsdc)) *
            100,
        ) / 100;
    }

    return new Response(
      JSON.stringify({
        fundSlug: fund.slug,
        mandate: mandate ?? null,
        mandateValueUsdc,
        mandateProfitUsdc,
        totalNotional: pool.totalNotional,
        totalDeposited: pool.totalDeposited,
        capRemaining: poolCapRemaining(fund, pool.totalDeposited),
        raiseOpen: poolRaiseOpen(fund, pool.totalDeposited),
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
    withdraw?: boolean;
  };

  const isWithdraw = body.withdraw === true;

  try {
    if (fund.status === "closed" || fund.status === "archived") {
      return new Response(JSON.stringify({ error: "Fund is closed" }), {
        status: 400,
      });
    }

    const pool = await buildVirtualPool(fund);

    if (!poolRaiseOpen(fund, pool.totalDeposited)) {
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
    if (!amountUsdc || amountUsdc <= 0) {
      return new Response(
        JSON.stringify({ error: "Enter a positive amount" }),
        { status: 400 },
      );
    }

    if (!isWithdraw && amountUsdc < 5) {
      return new Response(
        JSON.stringify({ error: "Minimum $5 commitment" }),
        { status: 400 },
      );
    }

    const authError = await verifyBundleSignature({
      message: body.message ?? "",
      signature: body.signature ?? "0x",
      managerAddress: address,
      action: isWithdraw ? "withdraw" : "commit",
      slug: fund.slug,
    });
    if (authError) {
      return new Response(JSON.stringify({ error: authError }), { status: 401 });
    }

    if (isWithdraw) {
      const mandate = await reduceMandateCommitment(
        fund.slug,
        address,
        amountUsdc,
      );
      // Full leave → drop auto-trade session (authorize stays on join only).
      if (mandate.notionalUsdc <= 0) {
        await revokeTradingSession(fund.slug, address);
      }
      return new Response(JSON.stringify({ mandate }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = await getTradingSession(fund.slug, address);
    if (!session?.authorized || !session.serverSigner) {
      return new Response(
        JSON.stringify({
          error: "Authorize auto-trading before committing to this fund",
        }),
        { status: 400 },
      );
    }

    const capRemaining = poolCapRemaining(fund, pool.totalDeposited);
    if (capRemaining != null && amountUsdc > capRemaining) {
      return new Response(
        JSON.stringify({
          error: `Pool cap exceeded — $${capRemaining.toFixed(2)} remaining`,
        }),
        { status: 400 },
      );
    }

    const existing = await getMandate(fund.slug, address);
    const existingDeposited =
      existing?.depositedUsdc ?? existing?.notionalUsdc ?? 0;
    const nextDeposited = existingDeposited + amountUsdc;

    const backing = await investorMandateBacking(
      fund.slug,
      address,
      existing?.id,
    );

    if (backing.liquidUsdc < amountUsdc) {
      return new Response(
        JSON.stringify({
          error: `Deposit wallet has $${backing.liquidUsdc.toFixed(2)} pUSD — need $${amountUsdc.toFixed(2)} to add`,
        }),
        { status: 400 },
      );
    }

    if (backing.totalUsdc < nextDeposited) {
      const maxAdd = Math.max(
        0,
        round(backing.totalUsdc - existingDeposited, 2),
      );
      const detail =
        maxAdd >= 5
          ? `You have $${backing.totalUsdc.toFixed(2)} backing this mandate ($${backing.liquidUsdc.toFixed(2)} liquid + $${backing.deployedUsdc.toFixed(2)} in positions) — maximum add right now is $${maxAdd.toFixed(2)}`
          : `You have $${backing.totalUsdc.toFixed(2)} backing this mandate ($${backing.liquidUsdc.toFixed(2)} liquid + $${backing.deployedUsdc.toFixed(2)} in positions) — deposit more pUSD before increasing your $${existingDeposited.toFixed(2)} commitment`;
      return new Response(JSON.stringify({ error: detail }), { status: 400 });
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

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
