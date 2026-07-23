import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import { isFundOwnerWallet } from "@/lib/funds/access";
import { beginInstructionExecution } from "@/lib/funds/execute-trades";
import {
  createInstruction,
  listInstructionsByFund,
} from "@/lib/funds/instructions";
import { planTradeBatch, type TradeDraft } from "@/lib/funds/instruction-plan";
import { adjustMandateCash } from "@/lib/funds/mandates";
import { reconcileFundMandates } from "@/lib/funds/mandate-reconcile";
import { recordFanoutTrades } from "@/lib/funds/mandate-trades";
import { buildVirtualPool, poolTradingOpen } from "@/lib/funds/pool";
import {
  runPendingTradesForFund,
  type PendingTradeRun,
} from "@/lib/funds/run-pending-trades";
import type { ExecutionSummary } from "@/lib/funds/execute-trades";
import { getFund } from "@/lib/funds/store";
import { serverSigningEnabled } from "@/lib/privy/server";

export const prerender = false;

function normalizeDrafts(body: {
  gammaMarketId?: string;
  tokenId?: string;
  side?: string;
  totalUsdc?: number;
  orderSide?: "BUY" | "SELL";
  trades?: TradeDraft[];
}): TradeDraft[] {
  if (body.trades?.length) {
    return body.trades.map((trade) => ({
      gammaMarketId: trade.gammaMarketId,
      tokenId: trade.tokenId,
      side: trade.side,
      totalUsdc: Number(trade.totalUsdc),
      orderSide: trade.orderSide === "SELL" ? "SELL" : "BUY",
    }));
  }

  if (body.gammaMarketId || body.tokenId) {
    return [
      {
        gammaMarketId: body.gammaMarketId,
        tokenId: body.tokenId,
        side: body.side ?? "",
        totalUsdc: Number(body.totalUsdc),
        orderSide: body.orderSide === "SELL" ? "SELL" : "BUY",
      },
    ];
  }

  return [];
}

export const GET: APIRoute = async ({ params }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  try {
    const instructions = await listInstructionsByFund(fund.slug);
    return new Response(JSON.stringify({ instructions }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Read failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const body = (await request.json()) as {
    managerAddress?: string;
    message?: string;
    signature?: `0x${string}`;
    gammaMarketId?: string;
    tokenId?: string;
    side?: string;
    totalUsdc?: number;
    orderSide?: "BUY" | "SELL";
    trades?: TradeDraft[];
    dryRun?: boolean;
    execute?: boolean;
  };

  try {
    const pool = await buildVirtualPool(fund);

    if (!poolTradingOpen(fund, pool.totalNotional)) {
      return new Response(JSON.stringify({ error: "Trading window is closed" }), {
        status: 400,
      });
    }

    const managerAddress = body.managerAddress?.trim();
    if (!managerAddress || !isFundOwnerWallet(fund, managerAddress)) {
      return new Response(JSON.stringify({ error: "Manager wallet required" }), {
        status: 403,
      });
    }

    const drafts = normalizeDrafts(body);
    if (drafts.length === 0) {
      return new Response(JSON.stringify({ error: "At least one trade required" }), {
        status: 400,
      });
    }

    const dryRunOnly = Boolean(body.dryRun && !body.execute);
    if (!dryRunOnly) {
      const authError = await verifyBundleSignature({
        message: body.message ?? "",
        signature: body.signature ?? "0x",
        managerAddress,
        action: "instruct",
        slug: fund.slug,
      });
      if (authError) {
        return new Response(JSON.stringify({ error: authError }), { status: 401 });
      }
    }

    const mandates = await reconcileFundMandates(fund.slug);
    const { listPositionsByFund } = await import("@/lib/funds/mandate-positions");
    const positions = await listPositionsByFund(fund.slug);
    const planned = await planTradeBatch(drafts, mandates, positions);

    if (dryRunOnly) {
      return new Response(
        JSON.stringify({
          dryRun: true,
          trades: planned,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const instructions: Array<
      Awaited<ReturnType<typeof createInstruction>> & { status: "executing" }
    > = [];
    const allTrades: Awaited<ReturnType<typeof recordFanoutTrades>> = [];
    const summaries: ExecutionSummary[] = [];

    for (const trade of planned) {
      const instruction = await createInstruction({
        fundSlug: fund.slug,
        managerWallet: managerAddress,
        tokenId: trade.tokenId,
        question: trade.question,
        side: trade.side,
        orderSide: trade.orderSide,
        totalUsdc: trade.totalUsdc,
        price: trade.price,
      });

      const trades = await recordFanoutTrades({
        fundSlug: fund.slug,
        instructionId: instruction.id,
        tokenId: trade.tokenId,
        question: trade.question,
        side: trade.side,
        orderSide: trade.orderSide,
        price: trade.price,
        slices: trade.slices,
      });

      // Buys reserve cash up front; sells credit cash on fill.
      if (trade.orderSide !== "SELL") {
        for (const slice of trade.slices) {
          await adjustMandateCash(slice.mandateId, fund.slug, -slice.usdcAmount);
        }
      }

      const summary = await beginInstructionExecution(fund.slug, instruction.id);
      instructions.push({ ...instruction, status: "executing" });
      allTrades.push(...trades);
      summaries.push(summary);
    }

    let serverRuns: PendingTradeRun[] = [];
    let serverSigningError: string | undefined;

    if (serverSigningEnabled()) {
      try {
        const batch = await runPendingTradesForFund(fund.slug);
        serverRuns = batch.results;
      } catch (e) {
        serverSigningError =
          e instanceof Error ? e.message : "Server trade execution failed";
      }
    } else {
      serverSigningError = "Server signing not configured";
    }

    const pending = summaries.reduce((sum, s) => sum + s.pending, 0);
    const withoutSession = summaries.reduce((sum, s) => sum + s.withoutSession, 0);

    return new Response(
      JSON.stringify({
        instructions,
        trades: allTrades,
        summaries,
        summary: {
          count: instructions.length,
          pending,
          withoutSession,
        },
        serverRuns,
        serverSigningError,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Instruction failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
