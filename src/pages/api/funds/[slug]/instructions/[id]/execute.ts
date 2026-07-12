import type { APIRoute } from "astro";
import { isFundOwnerWallet } from "@/lib/funds/access";
import { beginInstructionExecution } from "@/lib/funds/execute-trades";
import { getInstruction } from "@/lib/funds/instructions";
import { listTradesByInstruction } from "@/lib/funds/mandate-trades";
import { getFund } from "@/lib/funds/store";

export const prerender = false;

/** Manager kicks off execution — pending slices are filled by investor autopilot. */
export const POST: APIRoute = async ({ params, request }) => {
  const fund = await getFund(params.slug!);
  if (!fund) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  const instructionId = params.id;
  if (!instructionId) {
    return new Response(JSON.stringify({ error: "Instruction id required" }), {
      status: 400,
    });
  }

  const body = (await request.json()) as { managerAddress?: string };

  try {
    const managerAddress = body.managerAddress?.trim();
    if (!managerAddress || !isFundOwnerWallet(fund, managerAddress)) {
      return new Response(JSON.stringify({ error: "Manager wallet required" }), {
        status: 403,
      });
    }

    const instruction = await getInstruction(fund.slug, instructionId);
    if (!instruction) {
      return new Response(JSON.stringify({ error: "Instruction not found" }), {
        status: 404,
      });
    }

    const summary = await beginInstructionExecution(fund.slug, instructionId);
    const trades = await listTradesByInstruction(fund.slug, instructionId);

    return new Response(
      JSON.stringify({ instruction, trades, summary }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Execution failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
