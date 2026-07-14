import { useEffect, useRef } from "react";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

const POLL_MS = 5000;

/** Polls server-side fan-out execution while the investor is logged in (any fund). */
export default function InvestorTradeAutopilot() {
  const { walletAddress } = useWalletSession();
  const running = useRef(false);

  useEffect(() => {
    if (!walletAddress) return;

    let cancelled = false;

    async function tick() {
      if (running.current || cancelled) return;
      running.current = true;

      try {
        const res = await fetch("/api/investor/trades/execute-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: walletAddress }),
        });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as {
          redeems?: Array<{ status: string; fundSlug?: string }>;
        };
        if (
          (data.redeems ?? []).some(
            (run) => run.status === "redeemed" || run.status === "failed",
          )
        ) {
          notifyPoolUpdated();
        }
      } catch {
        /* retry next poll */
      } finally {
        running.current = false;
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [walletAddress]);

  return null;
}
