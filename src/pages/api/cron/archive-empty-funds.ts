import type { APIRoute } from "astro";
import { depositPhaseActive } from "@/lib/funds/lifecycle";
import { listMandatesByFund } from "@/lib/funds/mandates";
import { totalPoolNotional } from "@/lib/funds/fanout";
import { archiveFund, getAllFunds } from "@/lib/funds/store";

export const prerender = false;

type ArchivedEntry = { slug: string; archivedAt: string };

/**
 * Archive funds that reached the trading phase without raising any capital.
 * Call from a scheduler (EventBridge, cron) with `Authorization: Bearer <CRON_SECRET>`.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const funds = await getAllFunds();
    const archived: ArchivedEntry[] = [];
    let skipped = 0;

    for (const fund of funds) {
      // Only trading-phase funds are candidates; closed/archived funds are already terminal.
      if (fund.status !== "trading") {
        skipped++;
        continue;
      }
      // Raise window still open — give it a chance to attract deposits.
      if (depositPhaseActive(fund)) {
        skipped++;
        continue;
      }

      const mandates = await listMandatesByFund(fund.slug);
      if (totalPoolNotional(mandates) > 0) {
        skipped++;
        continue;
      }

      const result = await archiveFund(fund.slug);
      archived.push({ slug: result.slug, archivedAt: result.archivedAt ?? "" });
    }

    return new Response(JSON.stringify({ archived, skipped }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Archive sweep failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
