import { useEffect, useRef } from "react";

type TradeRun = {
  tradeId: string;
  status: "filled" | "failed" | "skipped";
  detail?: string;
};

type Props = {
  fundSlug: string;
  address: `0x${string}`;
  enabled: boolean;
  onTradeSettled?: () => void;
  onError?: (message: string) => void;
};

const POLL_MS = 5000;

/** Triggers server-side fan-out execution via Privy session signers. */
export default function FundTradeAutopilot({
  fundSlug,
  address,
  enabled,
  onTradeSettled,
  onError,
}: Props) {
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || !address) return;

    let cancelled = false;

    async function tick() {
      if (running.current || cancelled) return;
      running.current = true;

      try {
        const res = await fetch(`/api/funds/${fundSlug}/trades/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          onError?.(data.error ?? `Autopilot unavailable (${res.status})`);
          return;
        }

        const results = (data.results ?? []) as TradeRun[];
        const failure = results.find((r) => r.status === "failed");
        if (failure?.detail) {
          onError?.(failure.detail);
        }

        if (results.some((r) => r.status === "filled" || r.status === "failed")) {
          onTradeSettled?.();
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
  }, [fundSlug, address, enabled, onTradeSettled, onError]);

  return null;
}
