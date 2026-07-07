import { useEffect, useState } from "react";
import type { Fund } from "@/lib/funds/types";
import type { LiveMarket } from "@/lib/polymarket/gamma";
import WagmiScope from "@/components/app/WagmiScope";
import { useFundInvestment } from "@/components/funds/InvestedBadge";

type Props = {
  fund: Fund;
};

const REFRESH_MS = 15_000;
const headerClass =
  "text-primary/50 text-[0.65rem] font-medium leading-none tracking-wide uppercase";

function formatPrice(price: number) {
  return `${(price * 100).toFixed(1)}¢`;
}

export default function MarketBasket({ fund }: Props) {
  return (
    <WagmiScope>
      <MarketBasketInner fund={fund} />
    </WagmiScope>
  );
}

function MarketBasketInner({ fund }: Props) {
  const [markets, setMarkets] = useState<LiveMarket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const { investment } = useFundInvestment(fund.slug);

  const investedByToken = new Map(
    investment?.legs.map((leg) => [leg.tokenId, leg.investedUsdc]) ?? [],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/funds/${fund.slug}/markets`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load prices");
        if (cancelled) return;
        setMarkets(data.markets);
        setLive(true);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load prices");
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fund.slug]);

  const rows = (markets ?? fund.markets).map((m) => {
    const fundMarket = fund.markets.find(
      (fm) => fm.gammaMarketId === m.gammaMarketId,
    );
    const investedUsdc = fundMarket
      ? investedByToken.get(fundMarket.tokenId)
      : undefined;

    return {
      key: m.gammaMarketId,
      question: m.question,
      side: m.side,
      weight: m.weight,
      price: "price" in m && typeof m.price === "number" ? m.price : null,
      investedUsdc,
    };
  });

  return (
    <div className="bg-primary/5 border-primary/10 rounded-lg border p-5 lg:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className={headerClass}>Market basket</h2>
          <p className="text-primary/40 mt-1 text-xs">
            {fund.markets.length} markets · weights total 100%
          </p>
        </div>
        {live && (
          <span className="text-primary/40 inline-flex items-center gap-1.5 text-[0.65rem] font-medium uppercase">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
            Live
          </span>
        )}
      </div>

      {error && <p className="text-red-400 mb-3 text-xs">{error}</p>}

      <div className={`${headerClass} mb-2 hidden gap-4 px-1 lg:grid lg:grid-cols-[1fr_auto_auto_auto]`}>
        <span>Market</span>
        <span className="w-10 text-center">Side</span>
        <span className="w-12 text-right">Weight</span>
        <span className="w-14 text-right">Price</span>
      </div>

      <ul className="divide-primary/10 divide-y">
        {rows.map((market) => (
          <li
            key={market.key}
            className="grid gap-2 py-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center lg:gap-4"
          >
            <div className="min-w-0">
              <p className="text-primary text-sm leading-snug">
                {market.question}
              </p>
              {market.investedUsdc != null && market.investedUsdc > 0 && (
                <p className="text-primary/50 mt-1 font-mono text-xs tabular-nums">
                  ${market.investedUsdc.toFixed(2)} in your position
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:contents">
              <span
                className={
                  market.side === "yes"
                    ? "rounded bg-emerald-500/15 px-2 py-0.5 text-center text-[0.65rem] font-medium uppercase text-emerald-300 lg:w-10"
                    : "rounded bg-red-500/15 px-2 py-0.5 text-center text-[0.65rem] font-medium uppercase text-red-300 lg:w-10"
                }
              >
                {market.side}
              </span>
              <span className="text-primary/60 font-mono text-xs tabular-nums lg:w-12 lg:text-right">
                {market.weight}%
              </span>
              <span className="text-primary font-mono text-xs tabular-nums lg:w-14 lg:text-right">
                {market.price != null ? formatPrice(market.price) : "…"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
