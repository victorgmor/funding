import { useEffect, useMemo, useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import WalletPanelPlaceholder from "@/components/app/WalletPanelPlaceholder";
import { isFundOwner } from "@/lib/funds/editable";
import { formatUsdExact } from "@/lib/funds/format";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import type { Fund, FanoutSlice, MandatePosition, OrderSide, VirtualPool } from "@/lib/funds/types";
import type { MarketSide } from "@/lib/funds/types";
import {
  formatOutcomeCents,
  parseOutcomes,
  type SearchMarket,
} from "@/lib/polymarket/gamma";
import { walletNavButtonClass } from "@/lib/walletNavChrome";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";

const tradeChipClass = `${walletNavButtonClass} !px-4 !py-2.5`;

type Props = { fund: Fund };

type PlannedTrade = {
  gammaMarketId?: string;
  totalUsdc: number;
  price: number;
  tokenId: string;
  question: string;
  side: MarketSide;
  orderSide: OrderSide;
  slices: FanoutSlice[];
};

type PreviewTrade = PlannedTrade & { id: string };

type SellPositionOption = {
  tokenId: string;
  question: string;
  side: MarketSide;
  shares: number;
  costUsdc: number;
};

export default function ManagerPoolPanel({ fund }: Props) {
  const { address, walletAddress, isConnected, loading: walletLoading } = useWalletGate();
  const isOwner = isFundOwner(fund, walletAddress);

  const [pool, setPool] = useState<VirtualPool | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchMarket[]>([]);
  const [selected, setSelected] = useState<(SearchMarket & { side: MarketSide }) | null>(
    null,
  );
  const [amount, setAmount] = useState("20");
  const [orderSide, setOrderSide] = useState<OrderSide>("BUY");
  const [sellTarget, setSellTarget] = useState<SellPositionOption | null>(null);
  const [previewQueue, setPreviewQueue] = useState<PreviewTrade[]>([]);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const deployable = Math.max(0, pool?.totalCash ?? 0);
  const openPositions = useMemo((): SellPositionOption[] => {
    const byToken = new Map<string, SellPositionOption>();
    for (const pos of (pool?.positions ?? []) as MandatePosition[]) {
      if (pos.redeemedAt || pos.shares <= 0) continue;
      const existing = byToken.get(pos.tokenId);
      if (existing) {
        existing.shares += pos.shares;
        existing.costUsdc += pos.costUsdc;
      } else {
        byToken.set(pos.tokenId, {
          tokenId: pos.tokenId,
          question: pos.question,
          side: pos.side,
          shares: pos.shares,
          costUsdc: pos.costUsdc,
        });
      }
    }
    return [...byToken.values()].sort((a, b) => b.costUsdc - a.costUsdc);
  }, [pool?.positions]);

  const queuedBuyTotal = useMemo(
    () =>
      previewQueue
        .filter((trade) => trade.orderSide !== "SELL")
        .reduce((sum, trade) => sum + trade.totalUsdc, 0),
    [previewQueue],
  );
  const queuedSellTotal = useMemo(
    () =>
      previewQueue
        .filter((trade) => trade.orderSide === "SELL")
        .reduce((sum, trade) => sum + trade.totalUsdc, 0),
    [previewQueue],
  );
  const remainingDeployable = Math.max(0, deployable - queuedBuyTotal);

  const sellMaxUsdc = useMemo(() => {
    if (!sellTarget) return 0;
    const queuedShares = previewQueue
      .filter(
        (trade) =>
          trade.orderSide === "SELL" && trade.tokenId === sellTarget.tokenId,
      )
      .reduce((sum, trade) => sum + trade.slices.reduce((s, x) => s + x.shares, 0), 0);
    const remainingShares = Math.max(0, sellTarget.shares - queuedShares);
    // Ceiling at ~$1/share; server clamps to mid × shares.
    return Math.round(remainingShares * 100) / 100;
  }, [sellTarget, previewQueue]);

  useEffect(() => {
    if (!isOwner || !address) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/funds/${fund.slug}/pool?address=${encodeURIComponent(address)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load pool");
        setPool(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load pool");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isOwner, address, fund.slug]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/polymarket/search?q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setResults(data.markets ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  async function requestChallenge() {
    if (!address) throw new Error("Connect wallet first");
    const params = new URLSearchParams({
      address,
      action: "instruct",
      slug: fund.slug,
    });
    const res = await fetch(`/api/auth/bundle-challenge?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not start signing");
    return data.message as string;
  }

  async function addToPreview() {
    if (!address || busy) return;
    if (orderSide === "BUY" && !selected) return;
    if (orderSide === "SELL" && !sellTarget) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const tradeAmount = Number(amount);
      if (!Number.isFinite(tradeAmount) || tradeAmount < 1) {
        throw new Error("Trade amount required");
      }
      if (orderSide === "BUY" && tradeAmount > remainingDeployable) {
        throw new Error(
          `Only ${formatUsdExact(remainingDeployable)} left in preview budget — cannot add ${formatUsdExact(tradeAmount)}`,
        );
      }

      const draft =
        orderSide === "SELL"
          ? {
              tokenId: sellTarget!.tokenId,
              side: sellTarget!.side,
              totalUsdc: tradeAmount,
              orderSide: "SELL" as const,
            }
          : {
              gammaMarketId: selected!.gammaMarketId,
              side: selected!.side,
              totalUsdc: tradeAmount,
              orderSide: "BUY" as const,
            };

      const drafts = [
        ...previewQueue.map((trade) => ({
          gammaMarketId: trade.gammaMarketId,
          tokenId: trade.tokenId,
          side: trade.side,
          totalUsdc: trade.totalUsdc,
          orderSide: trade.orderSide,
        })),
        draft,
      ];

      const res = await fetch(`/api/funds/${fund.slug}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerAddress: address,
          trades: drafts,
          dryRun: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");

      const planned = data.trades as PlannedTrade[] | undefined;
      if (!planned?.length) throw new Error("Preview failed");

      setPreviewQueue(
        planned.map((trade, index) => ({
          ...trade,
          orderSide: trade.orderSide ?? "BUY",
          id:
            previewQueue[index]?.id ??
            `${trade.tokenId}-${trade.orderSide}-${Date.now()}-${index}`,
        })),
      );
      setSelected(null);
      setSellTarget(null);
      setQuery("");
      setAmount("20");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function executeAll() {
    if (!address || busy || previewQueue.length === 0) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const message = await requestChallenge();
      setSigning(true);
      const signature = await signWalletMessage(message).finally(() =>
        setSigning(false),
      );

      const res = await fetch(`/api/funds/${fund.slug}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerAddress: address,
          message,
          signature,
          trades: previewQueue.map((trade) => ({
            gammaMarketId: trade.gammaMarketId,
            tokenId: trade.tokenId,
            side: trade.side,
            totalUsdc: trade.totalUsdc,
            orderSide: trade.orderSide,
          })),
          execute: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Instruction failed");

      const tradeCount = previewQueue.length;
      setPreviewQueue([]);
      const poolRes = await fetch(
        `/api/funds/${fund.slug}/pool?address=${encodeURIComponent(address)}`,
      );
      const poolData = await poolRes.json();
      if (poolRes.ok) setPool(poolData);
      notifyPoolUpdated(fund.slug);

      const execSummary = data.summary as {
        count?: number;
        pending?: number;
        withoutSession?: number;
      } | undefined;

      if (execSummary?.pending) {
        setNotice(
          execSummary.withoutSession
            ? `${execSummary.count ?? tradeCount} instruction(s) recorded — ${execSummary.pending} slice(s) queued. ${execSummary.withoutSession} investor(s) need to authorize auto-trading.`
            : `${execSummary.count ?? tradeCount} instruction(s) recorded — ${execSummary.pending} slice(s) queued for autopilot.`,
        );
        // Autopilot fills async — refresh again so Predictions catch filled/failed.
        window.setTimeout(() => notifyPoolUpdated(fund.slug), 4000);
      } else {
        setNotice(`${execSummary?.count ?? tradeCount} instruction(s) recorded.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Instruction failed");
    } finally {
      setBusy(false);
    }
  }

  async function replanPreview(trades: PreviewTrade[]) {
    if (!address || trades.length === 0) {
      setPreviewQueue([]);
      return;
    }

    const res = await fetch(`/api/funds/${fund.slug}/instructions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        managerAddress: address,
        trades: trades.map((trade) => ({
          gammaMarketId: trade.gammaMarketId,
          tokenId: trade.tokenId,
          side: trade.side,
          totalUsdc: trade.totalUsdc,
          orderSide: trade.orderSide,
        })),
        dryRun: true,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Preview failed");

    const planned = data.trades as PlannedTrade[] | undefined;
    if (!planned?.length) throw new Error("Preview failed");

    setPreviewQueue(
      planned.map((trade, index) => ({
        ...trade,
        id: trades[index]?.id ?? `${trade.gammaMarketId}-${index}`,
      })),
    );
  }

  async function removeFromPreview(id: string) {
    const next = previewQueue.filter((trade) => trade.id !== id);
    if (next.length === previewQueue.length) return;

    setBusy(true);
    setError(null);
    try {
      await replanPreview(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) return null;
  if (fund.status !== "trading") return null;

  const inputClass =
    "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";

  return (
    <div className="border-primary/10 border-b pb-4 pt-4">
      {!isConnected || !address ? (
        <>
          <div data-wallet-restoring>
            <WalletPanelPlaceholder label="Loading wallet…" />
          </div>
          <div data-wallet-connect-cta>
            <ConnectWallet variant="panel" />
          </div>
        </>
      ) : loading && !pool ? (
        <p className="text-primary/50 text-sm">Loading pool…</p>
      ) : (
        fund.status === "trading" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-primary text-sm font-medium">New trade</p>
              <div className="flex gap-1">
                {(["BUY", "SELL"] as OrderSide[]).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => {
                      setOrderSide(side);
                      setSelected(null);
                      setSellTarget(null);
                      setQuery("");
                      setError(null);
                    }}
                    className={`${tradeChipClass} !px-3 !py-1.5 text-xs uppercase ${
                      orderSide === side ? "text-white" : "text-white/45"
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            {orderSide === "BUY" ? (
              <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or paste Polymarket URL…"
              className={inputClass}
            />
            {searching && <p className="text-primary/50 text-xs">Searching…</p>}
            {results.length > 0 && (
              <ul className="border-primary/10 max-h-40 overflow-y-auto rounded border">
                {results.map((market) => (
                  <li key={market.gammaMarketId} className="border-primary/10 border-b">
                    <button
                      type="button"
                      onClick={() => {
                        const outcomes = parseOutcomes(market.outcomes);
                        setSelected({
                          ...market,
                          side: outcomes[0] ?? "",
                        });
                      }}
                      className="text-primary hover:bg-primary/10 w-full px-3 py-2 text-left text-sm"
                    >
                      {market.question}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <div className="space-y-2">
                <p className="text-primary/80 truncate text-sm">{selected.question}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {parseOutcomes(selected.outcomes).map((outcome) => {
                    const cents = formatOutcomeCents(
                      selected.outcomes,
                      selected.outcomePrices,
                      outcome,
                    );
                    const active = selected.side === outcome;
                    return (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() =>
                          setSelected({ ...selected, side: outcome })
                        }
                        className={`${tradeChipClass} uppercase ${
                          active ? "text-white" : "text-white/50 hover:text-white"
                        }`}
                      >
                        {outcome}
                        {cents ? (
                          <span className="font-mono tabular-nums normal-case">
                            {cents}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    min={1}
                    max={remainingDeployable > 0 ? remainingDeployable : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="border-primary/10 bg-primary/5 text-primary w-24 rounded-[12px] border px-3 py-2.5 text-sm tabular-nums focus:border-primary/30 focus:outline-none"
                    placeholder="$"
                    aria-label="Pool trade size"
                  />
                  <button
                    type="button"
                    disabled={busy || signing}
                    onClick={() => void addToPreview()}
                    className={`${tradeChipClass} uppercase disabled:opacity-40`}
                  >
                    {busy ? "…" : "Add"}
                  </button>
                </div>
                {deployable > 0 && (
                  <p className="text-primary/50 text-xs">
                    {formatUsdExact(remainingDeployable)} deployable
                    {previewQueue.length > 0 && (
                      <span>
                        {" "}
                        · {formatUsdExact(queuedBuyTotal)} buy queued ·{" "}
                        {formatUsdExact(deployable)} total
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}
              </>
            ) : (
              <div className="space-y-2">
                {openPositions.length === 0 ? (
                  <p className="text-primary/50 text-sm">
                    No open positions to sell yet.
                  </p>
                ) : (
                  <ul className="border-primary/10 max-h-48 overflow-y-auto rounded border">
                    {openPositions.map((pos) => {
                      const active = sellTarget?.tokenId === pos.tokenId;
                      return (
                        <li
                          key={pos.tokenId}
                          className="border-primary/10 border-b last:border-b-0"
                        >
                          <button
                            type="button"
                            onClick={() => setSellTarget(pos)}
                            className={`hover:bg-primary/10 w-full px-3 py-2 text-left text-sm ${
                              active ? "bg-primary/10" : ""
                            }`}
                          >
                            <span className="text-primary/80 line-clamp-2">
                              {pos.question}
                            </span>
                            <span className="text-primary/50 mt-0.5 block font-mono text-xs tabular-nums">
                              {pos.side} · {pos.shares.toFixed(2)} sh · cost{" "}
                              {formatUsdExact(pos.costUsdc)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {sellTarget && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={sellMaxUsdc > 0 ? sellMaxUsdc : undefined}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="border-primary/10 bg-primary/5 text-primary w-24 rounded-[12px] border px-3 py-2.5 text-sm tabular-nums focus:border-primary/30 focus:outline-none"
                      placeholder="$"
                      aria-label="Sell size"
                    />
                    <button
                      type="button"
                      disabled={busy || signing}
                      onClick={() => void addToPreview()}
                      className={`${tradeChipClass} uppercase disabled:opacity-40`}
                    >
                      {busy ? "…" : "Add sell"}
                    </button>
                    <p className="text-primary/50 w-full text-xs">
                      Market sell · up to ~{formatUsdExact(sellMaxUsdc)} at mid
                    </p>
                  </div>
                )}
              </div>
            )}

            {previewQueue.length > 0 && (
              <div className="border-primary/10 rounded border text-xs">
                <div className="border-primary/10 flex items-center justify-between gap-2 border-b px-3 py-2">
                  <p className="truncate text-sm uppercase text-primary/50">
                    Preview · {previewQueue.length}
                    {queuedBuyTotal > 0 && ` · buy ${formatUsdExact(queuedBuyTotal)}`}
                    {queuedSellTotal > 0 && ` · sell ${formatUsdExact(queuedSellTotal)}`}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void replanPreview([])}
                    className="text-primary/50 hover:text-primary text-xs uppercase disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>

                {previewQueue.map((trade) => (
                  <div key={trade.id} className="border-primary/10 border-b last:border-b-0">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <p className="text-primary/80 min-w-0 flex-1 truncate text-sm">
                        {trade.question}
                        <span className="text-primary/50 ml-2 uppercase">
                          {trade.orderSide === "SELL" ? "Sell" : "Buy"}{" "}
                          {trade.side} · {formatUsdExact(trade.totalUsdc)}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => void removeFromPreview(trade.id)}
                        className="text-primary/40 hover:text-primary shrink-0 p-1"
                        aria-label="Remove trade from preview"
                      >
                        ✕
                      </button>
                    </div>
                    <ul>
                      {trade.slices.map((slice) => (
                        <li
                          key={`${trade.id}-${slice.mandateId}`}
                          className="flex items-center justify-between gap-2 px-3 py-1.5"
                        >
                          <span className="text-primary/70 truncate font-mono">
                            {slice.investorWallet.slice(0, 8)}…
                          </span>
                          <span className="text-primary shrink-0 font-mono tabular-nums">
                            {formatUsdExact(slice.usdcAmount)}
                            <span className="text-primary/40 ml-1">
                              ({(slice.poolShare * 100).toFixed(0)}%)
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="border-primary/10 border-t px-3 py-2">
                  <button
                    type="button"
                    disabled={busy || signing}
                    onClick={() => void executeAll()}
                    className={`${tradeChipClass} w-full disabled:opacity-40`}
                  >
                    {signing
                      ? "Sign…"
                      : busy
                        ? "…"
                        : `Execute all (${previewQueue.length})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {notice && <p className="text-profit mt-3 text-sm">{notice}</p>}
      {error && <p className="text-red-500 mt-3 text-sm">{error}</p>}
    </div>
  );
}
