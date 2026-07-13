import type { APIRoute } from "astro";
import { verifyBundleSignature } from "@/lib/auth/bundle-auth";
import { isFundOwnerWallet } from "@/lib/funds/access";
import { fanoutTrade } from "@/lib/funds/fanout";
import {
  createInstruction,
  listInstructionsByFund,
} from "@/lib/funds/instructions";
import { adjustMandateCash, listMandatesByFund } from "@/lib/funds/mandates";
import { recordFanoutTrades } from "@/lib/funds/mandate-trades";
import { beginInstructionExecution } from "@/lib/funds/execute-trades";
import { poolTradingOpen } from "@/lib/funds/pool";
import type { MarketSide } from "@/lib/funds/types";
import { fetchGammaMarket, midPrice, parseOutcomes, outcomeIndex, tokenIdForSide } from "@/lib/polymarket/gamma";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

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
    side?: MarketSide;
    totalUsdc?: number;
    dryRun?: boolean;
    execute?: boolean;
  };

  try {
    if (!poolTradingOpen(fund)) {
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

    const totalUsdc = Number(body.totalUsdc);
    if (!totalUsdc || totalUsdc < 1) {
      return new Response(JSON.stringify({ error: "Trade amount required" }), {
        status: 400,
      });
    }

    if (!body.gammaMarketId) {
      return new Response(JSON.stringify({ error: "Market required" }), {
        status: 400,
      });
    }

    const gamma = await fetchGammaMarket(body.gammaMarketId);
    const outcomes = parseOutcomes(gamma.outcomes);
    const side = body.side?.trim() ?? "";
    if (!side || outcomeIndex(outcomes, side) === -1) {
      return new Response(
        JSON.stringify({
          error: `Outcome must be one of: ${outcomes.join(", ")}`,
        }),
        { status: 400 },
      );
    }

    const canonicalSide = outcomes[outcomeIndex(outcomes, side)]!;
    const price = Math.min(0.99, Math.max(0.01, midPrice(gamma, canonicalSide)));
    const tokenId = tokenIdForSide(gamma.clobTokenIds, gamma.outcomes, canonicalSide);

    const mandates = await listMandatesByFund(fund.slug);
    const slices = fanoutTrade(totalUsdc, price, mandates);

    if (body.dryRun || !body.execute) {
      return new Response(
        JSON.stringify({
          dryRun: true,
          totalUsdc,
          price,
          tokenId,
          question: gamma.question,
          side: canonicalSide,
          slices,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const instruction = await createInstruction({
      fundSlug: fund.slug,
      managerWallet: managerAddress,
      tokenId,
      question: gamma.question,
      side: canonicalSide,
      totalUsdc,
      price,
    });

    const trades = await recordFanoutTrades({
      fundSlug: fund.slug,
      instructionId: instruction.id,
      tokenId,
      question: gamma.question,
      side: canonicalSide,
      price,
      slices,
    });

    for (const slice of slices) {
      await adjustMandateCash(slice.mandateId, fund.slug, -slice.usdcAmount);
    }

    const summary = await beginInstructionExecution(fund.slug, instruction.id);

    return new Response(
      JSON.stringify({ instruction: { ...instruction, status: "executing" }, trades, slices, summary }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Instruction failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
