import { useEffect, useRef } from "react";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import type { MandateTrade } from "@/lib/funds/types";
import { readLocalTradingCreds } from "@/lib/funds/trading-session-client";
import { executeMandateTrade } from "@/lib/polymarket/trade";
import { wagmiConfig } from "@/lib/wagmi/config";

type Props = {
  fundSlug: string;
  address: `0x${string}`;
  enabled: boolean;
  onTradeSettled?: () => void;
};

const POLL_MS = 5000;

/** Runs pending fan-out slices automatically when a trading session is authorized. */
export default function FundTradeAutopilot({
  fundSlug,
  address,
  enabled,
  onTradeSettled,
}: Props) {
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || !address) return;

    let cancelled = false;

    async function tick() {
      if (running.current || cancelled) return;
      running.current = true;

      try {
        const res = await fetch(
          `/api/funds/${fundSlug}/trades?address=${encodeURIComponent(address)}&pending=1`,
        );
        const data = await res.json();
        if (!res.ok || cancelled) return;

        const trades = (data.trades ?? []) as MandateTrade[];
        if (trades.length === 0) return;

        const walletClient = await getWalletClient(wagmiConfig, {
          chainId: polygon.id,
          account: address,
        });
        if (!walletClient || cancelled) return;

        const creds = readLocalTradingCreds(fundSlug, address);

        for (const trade of trades) {
          if (cancelled) break;

          const result = await executeMandateTrade(
            walletClient,
            trade,
            undefined,
            creds,
          );

          const filled = result.status === "filled";
          await fetch(`/api/funds/${fundSlug}/trades`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              tradeId: trade.id,
              status: filled ? "filled" : "failed",
              detail: result.detail,
            }),
          });

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
  }, [fundSlug, address, enabled, onTradeSettled]);

  return null;
}
