import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";

const POLL_MS = 5000;

/** Polls server-side fan-out execution while the investor is logged in (any fund). */
export default function InvestorTradeAutopilot() {
  const { address, isConnected } = useAccount();
  const running = useRef(false);

  useEffect(() => {
    if (!isConnected || !address) return;

    let cancelled = false;

    async function tick() {
      if (running.current || cancelled) return;
      running.current = true;

      try {
        await fetch("/api/investor/trades/execute-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
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
  }, [address, isConnected]);

  return null;
}
