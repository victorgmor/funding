import type { APIRoute } from "astro";
import { getRelayBuilderConfig } from "@/lib/polymarket/builder-server";
import { RELAYER_URL } from "@/lib/polymarket/relay-config";

export const prerender = false;

type RelayerTransaction = {
  state: string;
  transactionHash?: string;
};

export const POST: APIRoute = async ({ request }) => {
  const builder = getRelayBuilderConfig();
  if (!builder) {
    return new Response(
      JSON.stringify({ error: "Builder credentials not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.text();

  const headers = await builder.generateBuilderHeaders("POST", "/submit", body);
  if (!headers) {
    return new Response(JSON.stringify({ error: "Could not sign relayer request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const submitRes = await fetch(`${RELAYER_URL}/submit`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body,
  });

  const submitData = (await submitRes.json()) as {
    transactionID?: string;
    error?: string;
  };

  if (!submitRes.ok) {
    return new Response(
      JSON.stringify({
        error: submitData.error ?? "Polymarket relayer rejected the payment",
      }),
      { status: submitRes.status, headers: { "Content-Type": "application/json" } },
    );
  }

  const transactionId = submitData.transactionID;
  if (!transactionId) {
    return new Response(JSON.stringify({ error: "No transaction ID returned" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(2000);
    const pollRes = await fetch(
      `${RELAYER_URL}/transaction?id=${encodeURIComponent(transactionId)}`,
    );
    if (!pollRes.ok) continue;

    const txs = (await pollRes.json()) as RelayerTransaction[];
    const tx = txs[0];
    if (!tx) continue;

    if (tx.state === "STATE_FAILED" || tx.state === "STATE_INVALID") {
      return new Response(JSON.stringify({ error: "Payment transaction failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (tx.transactionHash) {
      return new Response(JSON.stringify({ hash: tx.transactionHash }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({ error: "Payment submitted but confirmation timed out" }),
    { status: 504, headers: { "Content-Type": "application/json" } },
  );
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
