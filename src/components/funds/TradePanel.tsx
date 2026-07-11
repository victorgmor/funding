import { useState, useEffect } from "react";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import type { Fund, BasketQuote, ExitQuote, LegResult } from "@/lib/funds/types";
import { executeBuyQuote, executeExitQuote } from "@/lib/polymarket/trade";
import { wagmiConfig } from "@/lib/wagmi/config";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";
import ConnectWallet from "@/components/app/ConnectWallet";
import TradeOnboarding, {
  completeTradeOnboardingOnSuccess,
} from "@/components/funds/TradeOnboarding";
import { useFundInvestment } from "@/components/funds/InvestedBadge";
import { useUsdcBalance } from "@/lib/wagmi/useUsdcBalance";
import { resetTradeOnboarding } from "@/lib/trade/onboarding-storage";

type Props = {
  fund: Fund;
};

type InvestedView = "topup" | "exit";

const headerClass =
  "text-primary/50 text-[0.65rem] font-medium leading-none tracking-wide uppercase";

export default function TradePanel({ fund }: Props) {
  return <TradePanelInner fund={fund} />;
}

export function TradePanelInner({ fund }: Props) {
  const { address, isConnected, restoring } = useWalletSession();
  const { onPolygon, switching } = useEnsurePolygon();
  const [investedView, setInvestedView] = useState<InvestedView | null>(null);
  const [amount, setAmount] = useState("50");
  const [quote, setQuote] = useState<BasketQuote | ExitQuote | null>(null);
  const [results, setResults] = useState<LegResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trading, setTrading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [investRefresh, setInvestRefresh] = useState(0);
  const [guideKey, setGuideKey] = useState(0);

  const { invested, investment, loading: investmentLoading } =
    useFundInvestment(fund.slug, investRefresh);

  const { balanceUsdc, loading: usdcLoading } = useUsdcBalance(
    address as `0x${string}` | undefined,
  );

  const isBuy = !invested || investedView === "topup";
  const closed = fund.status === "closed";
  const canEnter =
    !closed &&
    !invested &&
    investedView === null &&
    !investmentLoading;

  useEffect(() => {
    if (investedView !== "exit" || !address) return;

    let cancelled = false;

    async function loadExitQuote() {
      setError(null);
      setResults(null);
      setLoading(true);
      try {
        const res = await fetch(`/api/funds/${fund.slug}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "exit", address }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Quote failed");
        setQuote(data);
      } catch (e) {
        if (cancelled) return;
        setQuote(null);
        setError(e instanceof Error ? e.message : "Quote failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadExitQuote();
    return () => {
      cancelled = true;
    };
  }, [investedView, address, fund.slug]);

  function resetTrade() {
    setQuote(null);
    setResults(null);
    setError(null);
  }

  function openInvestedView(view: InvestedView) {
    setInvestedView(view);
    resetTrade();
  }

  async function preview() {
    setError(null);
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/funds/${fund.slug}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isBuy
            ? { action: "buy", amount: Number(amount), address }
            : { action: "exit", address },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      setQuote(data);
    } catch (e) {
      setQuote(null);
      setError(e instanceof Error ? e.message : "Quote failed");
    } finally {
      setLoading(false);
    }
  }

  async function execute() {
    if (!quote || !address || !onPolygon) return;
    setTrading(true);
    setError(null);
    setStatus(null);
    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) {
        throw new Error("Wallet not ready — reconnect and try again");
      }
      const onStatus = (message: string) => setStatus(message);
      const legResults = isBuy
        ? await executeBuyQuote(walletClient, quote as BasketQuote, onStatus)
        : await executeExitQuote(walletClient, quote as ExitQuote, onStatus);
      setResults(legResults);
      if (legResults.some((r) => r.status === "filled")) {
        completeTradeOnboardingOnSuccess();
        setInvestRefresh((n) => n + 1);
        setInvestedView(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Trade failed";
      if (msg.includes("does not match") || msg.includes("Chain ID: 1")) {
        setError("Confirm the Polygon network in your wallet, then try again.");
      } else {
        setError(msg);
      }
    } finally {
      setTrading(false);
      setStatus(null);
    }
  }

  const buyQuote = isBuy ? (quote as BasketQuote | null) : null;
  const exitQuote = !isBuy ? (quote as ExitQuote | null) : null;
  const sectionTitle = !invested
    ? "Enter bundle"
    : investedView === "topup"
      ? "Top up"
      : investedView === "exit"
        ? "Exit"
        : "Your position";

  return (
    <>
      <TradeOnboarding
        isConnected={isConnected}
        onPolygon={onPolygon}
        restoring={restoring}
        canEnter={canEnter}
        usdcBalance={isConnected && onPolygon ? balanceUsdc : null}
        usdcLoading={usdcLoading}
        restartKey={guideKey}
      />

      <div className="bg-primary/5 border-primary/10 rounded-lg border p-5 lg:sticky lg:top-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className={headerClass}>{sectionTitle}</h2>
        <div className="flex items-center gap-2">
          {canEnter && (
            <button
              type="button"
              onClick={() => {
                resetTradeOnboarding();
                setGuideKey((k) => k + 1);
              }}
              className="text-primary/40 hover:text-primary text-[0.65rem] font-medium uppercase"
            >
              Guide
            </button>
          )}
          {invested && investedView && (
          <button
            type="button"
            onClick={() => {
              setInvestedView(null);
              resetTrade();
            }}
            className="text-primary/50 hover:text-primary text-[0.65rem] font-medium uppercase"
          >
            Back
          </button>
          )}
        </div>
      </div>

      {restoring ? (
        <p className="text-primary/50 text-sm">Loading wallet…</p>
      ) : !isConnected ? (
        <div className="space-y-3" data-onboarding="connect">
          <p className="text-primary/60 text-sm">Connect to enter this bundle.</p>
          <ConnectWallet variant="panel" />
        </div>
      ) : !onPolygon ? (
        <p className="text-primary/60 text-sm">
          {switching ? "Switching to Polygon…" : "Connecting to Polygon…"}
        </p>
      ) : closed && !invested ? (
        <p className="text-primary/60 text-sm">
          This bundle is closed to new entries.
        </p>
      ) : investmentLoading ? (
        <p className="text-primary/50 text-sm">Loading position…</p>
      ) : invested && investment && investedView === null ? (
        <>
          <p className="text-primary font-mono text-3xl font-semibold tabular-nums">
            ${investment.totalCurrent.toFixed(2)}
          </p>
          <p className="text-primary/50 mt-1 text-xs">
            Invested{" "}
            <span className="text-primary/70 font-mono tabular-nums">
              ${investment.totalInvested.toFixed(2)}
            </span>
          </p>

          <div className="mt-5 flex gap-2">
            {!closed && (
              <button
                type="button"
                onClick={() => openInvestedView("topup")}
                className="border-primary/10 text-primary hover:bg-primary/10 flex-1 rounded-full border py-2 text-[0.65rem] font-medium uppercase"
              >
                Top up
              </button>
            )}
            <button
              type="button"
              onClick={() => openInvestedView("exit")}
              className="border-primary/10 text-primary hover:bg-primary/10 flex-1 rounded-full border py-2 text-[0.65rem] font-medium uppercase"
            >
              Exit
            </button>
          </div>
        </>
      ) : (
        <>
          {isBuy && closed && (
            <p className="text-primary/60 mb-4 text-sm">
              This bundle is closed — top-ups are disabled.
            </p>
          )}

          {isBuy && !closed && (
            <div className="mb-4" data-onboarding="amount">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  className={headerClass}
                  htmlFor="trade-amount"
                >
                  Amount
                </label>
                {isConnected && onPolygon && !usdcLoading && (
                  <span className="text-primary/50 text-[0.65rem] tabular-nums">
                    ${balanceUsdc.toFixed(2)} pUSD
                  </span>
                )}
              </div>
              <div className="border-primary/10 flex items-center gap-2 rounded-full border py-1 pl-3 pr-1">
                <span className="text-primary/40 text-sm">$</span>
                <input
                  id="trade-amount"
                  type="number"
                  min={5}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-primary w-full border-0 bg-transparent py-1.5 text-sm font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-primary/40 pr-2 text-xs">pUSD</span>
              </div>
            </div>
          )}

          {!isBuy && (
            <p className="text-primary/60 mb-4 text-sm">
              Sell your positions across all bundle markets.
            </p>
          )}

          {!isBuy && loading && !exitQuote && (
            <p className="text-primary/50 mb-4 text-sm">Loading exit quote…</p>
          )}

          {isBuy && !closed && (
            <button
              type="button"
              disabled={loading}
              onClick={preview}
              data-onboarding="preview"
              className="border-primary/10 text-primary hover:bg-primary/10 mb-4 w-full rounded-full border py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Loading…" : "Preview orders"}
            </button>
          )}

          {error && <p className="text-red-400 mb-3 text-xs">{error}</p>}

          {buyQuote && (
            <div className="border-primary/10 mb-4 rounded-lg border">
              <p className={`${headerClass} border-primary/10 border-b px-3 py-2`}>
                Order breakdown
              </p>
              <ul className="divide-primary/10 divide-y text-xs">
                {buyQuote.legs.map((leg) => (
                  <li
                    key={leg.tokenId}
                    className="flex items-start justify-between gap-3 px-3 py-2.5"
                  >
                    <span className="text-primary/80 line-clamp-2 leading-snug">
                      {leg.question}
                    </span>
                    <span className="text-primary shrink-0 text-right font-mono tabular-nums">
                      <span className="block">${leg.usdcAmount}</span>
                      <span className="text-primary/50 uppercase">{leg.side}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {exitQuote && (
            <div className="border-primary/10 mb-4 rounded-lg border">
              <p className={`${headerClass} border-primary/10 border-b px-3 py-2`}>
                Exit breakdown
              </p>
              <ul className="divide-primary/10 divide-y text-xs">
                {exitQuote.legs.length === 0 ? (
                  <li className="text-primary/60 px-3 py-2.5">
                    No positions found. Wait a minute for Polymarket to sync.
                  </li>
                ) : (
                  exitQuote.legs.map((leg) => (
                    <li
                      key={leg.tokenId}
                      className="flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <span className="text-primary/80 line-clamp-2 leading-snug">
                        {leg.question}
                      </span>
                      <span className="text-primary shrink-0 text-right font-mono tabular-nums">
                        <span className="block">~${leg.estUsdc}</span>
                        <span className="text-primary/50">{leg.shares} sh</span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {quote &&
            (isBuy || (exitQuote && exitQuote.legs.length > 0)) && (
              <>
                {status && (
                  <p className="text-primary/50 mb-2 text-xs">{status}</p>
                )}
                <button
                  type="button"
                  disabled={trading}
                  onClick={execute}
                  data-onboarding="buy"
                  className="bg-accent hover:opacity-90 w-full rounded-full py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {trading
                    ? status ?? "Submitting…"
                    : isBuy
                      ? `Buy · $${buyQuote?.totalUsdc ?? amount}`
                      : `Sell · ~$${exitQuote?.totalEstUsdc.toFixed(2) ?? "0"}`}
                </button>
              </>
            )}

          {results && (
            <ul className="border-primary/10 mt-4 space-y-1.5 border-t pt-3 text-xs">
              {results.map((r) => (
                <li
                  key={r.question}
                  className={
                    r.status === "filled" ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {r.status === "filled" ? "✓" : "✗"} {r.question}
                  {r.detail ? ` — ${r.detail}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      </div>
    </>
  );
}
