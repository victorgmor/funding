import { useEffect, useMemo, useState } from "react";
import { formatUsdExact } from "@/lib/funds/format";
import { isFundOwner } from "@/lib/funds/editable";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import type { FanoutSlice, Fund, MarketSide, VirtualPool } from "@/lib/funds/types";
import {
  formatOutcomeCents,
  parseOutcomes,
  tokenIdForSide,
  type SearchMarket,
} from "@/lib/polymarket/gamma";
import { readResponseJson } from "@/lib/fetch-json";
import { walletNavButtonClass } from "@/lib/walletNavChrome";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";

type Props = { fund: Fund };

type PlannedTrade = {
  gammaMarketId?: string;
  totalUsdc: number;
  price: number;
  tokenId: string;
  question: string;
  side: MarketSide;
  slices: FanoutSlice[];
};

type PreviewTrade = PlannedTrade & { id: string };

type BookLevel = { price: string; size: string };

const field =
  "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";
const chip =
  "border-primary/10 bg-primary/5 text-primary/70 hover:text-primary rounded-[12px] border px-3 py-2 text-xs font-medium transition-colors";

function roundPrice(n: number) {
  return Math.round(n * 100) / 100;
}

function priceLabel(price: number) {
  return `$${Number(price).toFixed(1)}`;
}

export default function NewTradePanel({ fund }: Props) {
  const { address, walletAddress, isConnected } = useWalletGate();
  const isOwner = isFundOwner(fund, walletAddress);

  const [pool, setPool] = useState<VirtualPool | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchMarket[]>([]);
  const [selected, setSelected] = useState<
    (SearchMarket & { side: MarketSide }) | null
  >(null);
  const [amount, setAmount] = useState("20");
  const [limitPrice, setLimitPrice] = useState("");
  const [bids, setBids] = useState<BookLevel[]>([]);
  const [asks, setAsks] = useState<BookLevel[]>([]);
  const [bookError, setBookError] = useState<string | null>(null);
  const [previewQueue, setPreviewQueue] = useState<PreviewTrade[]>([]);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = isOwner && isConnected && Boolean(address);

  const deployable = Math.max(0, pool?.totalCash ?? 0);
  const queuedBuyTotal = useMemo(
    () => previewQueue.reduce((sum, trade) => sum + trade.totalUsdc, 0),
    [previewQueue],
  );
  const remainingDeployable = Math.max(0, deployable - queuedBuyTotal);

  const selectedTokenId = useMemo(() => {
    if (!selected?.side) return null;
    try {
      return tokenIdForSide(
        selected.clobTokenIds,
        selected.outcomes,
        selected.side,
      );
    } catch {
      return null;
    }
  }, [selected]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/funds/${fund.slug}/pool?address=${encodeURIComponent(address!)}`,
        );
        const data = await readResponseJson<VirtualPool & { error?: string }>(
          res,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load pool");
        setPool(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load pool");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, fund.slug, address]);

  useEffect(() => {
    if (!active) return;
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
        const data = await readResponseJson<{
          markets?: SearchMarket[];
          error?: string;
        }>(res);
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
  }, [active, query]);

  useEffect(() => {
    if (!selectedTokenId) {
      setBids([]);
      setAsks([]);
      return;
    }
    let cancelled = false;
    async function loadBook() {
      try {
        const res = await fetch(
          `/api/polymarket/book?token_id=${encodeURIComponent(selectedTokenId!)}`,
        );
        const data = await readResponseJson<{
          bids?: BookLevel[];
          asks?: BookLevel[];
          error?: string;
        }>(res);
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Orderbook unavailable");
        const nextBids = (data.bids ?? [])
          .slice()
          .sort((a, b) => Number(b.price) - Number(a.price))
          .slice(0, 6);
        const nextAsks = (data.asks ?? [])
          .slice()
          .sort((a, b) => Number(a.price) - Number(b.price))
          .slice(0, 6);
        setBids(nextBids);
        setAsks(nextAsks);
        setBookError(null);

        // Seed limit from best ask when empty / market just selected.
        if (!limitPrice && nextAsks[0]) {
          setLimitPrice(roundPrice(Number(nextAsks[0].price)).toFixed(2));
        }
      } catch (e) {
        if (!cancelled) {
          setBookError(
            e instanceof Error ? e.message : "Orderbook unavailable",
          );
        }
      }
    }
    void loadBook();
    const id = setInterval(() => void loadBook(), 4_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // limitPrice intentionally omitted — only seed once when book arrives empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTokenId]);

  if (!active || fund.status !== "trading") return null;

  async function requestChallenge() {
    const params = new URLSearchParams({
      address: address!,
      action: "instruct",
      slug: fund.slug,
    });
    const res = await fetch(`/api/auth/bundle-challenge?${params}`);
    const data = await readResponseJson<{ message?: string; error?: string }>(
      res,
    );
    if (!res.ok) throw new Error(data.error ?? "Could not start signing");
    return data.message as string;
  }

  function draftsFrom(queue: PreviewTrade[], extra?: TradeDraftInput) {
    const drafts = queue.map((trade) => ({
      gammaMarketId: trade.gammaMarketId,
      tokenId: trade.tokenId,
      side: trade.side,
      totalUsdc: trade.totalUsdc,
      price: trade.price,
      orderSide: "BUY" as const,
    }));
    if (extra) drafts.push(extra);
    return drafts;
  }

  type TradeDraftInput = {
    gammaMarketId?: string;
    tokenId?: string;
    side: MarketSide;
    totalUsdc: number;
    price: number;
    orderSide: "BUY";
  };

  async function planPreview(drafts: TradeDraftInput[], ids: string[]) {
    const res = await fetch(`/api/funds/${fund.slug}/instructions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        managerAddress: address,
        trades: drafts,
        dryRun: true,
      }),
    });
    const data = await readResponseJson<{
      trades?: PlannedTrade[];
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(data.error ?? "Preview failed");
    if (!data.trades?.length) throw new Error("Preview failed");
    setPreviewQueue(
      data.trades.map((trade, index) => ({
        ...trade,
        id: ids[index] ?? `${trade.tokenId}-BUY-${Date.now()}-${index}`,
      })),
    );
  }

  async function addToPreview() {
    if (busy || !selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tradeAmount = Number(amount);
      const price = Number(limitPrice);
      if (!Number.isFinite(tradeAmount) || tradeAmount < 1) {
        throw new Error("Trade amount required");
      }
      if (!Number.isFinite(price) || price < 0.01 || price > 0.99) {
        throw new Error("Limit price must be between 0.01 and 0.99");
      }
      if (tradeAmount > remainingDeployable) {
        throw new Error(
          `Only ${formatUsdExact(remainingDeployable)} left in preview budget`,
        );
      }

      await planPreview(
        draftsFrom(previewQueue, {
          gammaMarketId: selected.gammaMarketId,
          side: selected.side,
          totalUsdc: tradeAmount,
          price,
          orderSide: "BUY",
        }),
        previewQueue.map((trade) => trade.id),
      );
      setSelected(null);
      setQuery("");
      setAmount("20");
      setLimitPrice("");
      setBids([]);
      setAsks([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromPreview(id: string) {
    const next = previewQueue.filter((trade) => trade.id !== id);
    if (next.length === previewQueue.length) return;
    if (next.length === 0) {
      setPreviewQueue([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await planPreview(
        draftsFrom(next),
        next.map((trade) => trade.id),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function executeAll() {
    if (busy || previewQueue.length === 0) return;
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
          trades: draftsFrom(previewQueue),
          execute: true,
        }),
      });
      const data = await readResponseJson<{
        summary?: {
          count?: number;
          pending?: number;
          withoutSession?: number;
        };
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "Instruction failed");

      const tradeCount = previewQueue.length;
      setPreviewQueue([]);
      notifyPoolUpdated(fund.slug);

      const execSummary = data.summary;
      if (execSummary?.pending) {
        setNotice(
          execSummary.withoutSession
            ? `${execSummary.count ?? tradeCount} instruction(s) recorded — ${execSummary.pending} slice(s) queued. ${execSummary.withoutSession} investor(s) need auto-trading.`
            : `${execSummary.count ?? tradeCount} instruction(s) recorded — ${execSummary.pending} slice(s) queued for autopilot.`,
        );
        window.setTimeout(() => notifyPoolUpdated(fund.slug), 4000);
      } else {
        setNotice(
          `${execSummary?.count ?? tradeCount} instruction(s) recorded.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Instruction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-primary/10 border-b pb-4 pt-4">
      <div className="space-y-3">
        <p className="text-primary text-sm font-medium">New trade</p>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or paste Polymarket URL…"
          className={field}
        />
        {searching && <p className="text-primary/50 text-xs">Searching…</p>}
        {results.length > 0 && (
          <ul className="border-primary/10 max-h-40 overflow-y-auto rounded border">
            {results.map((market) => (
              <li
                key={market.gammaMarketId}
                className="border-primary/10 border-b last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    const outcomes = parseOutcomes(market.outcomes);
                    setSelected({
                      ...market,
                      side: outcomes[0] ?? "",
                    });
                    setLimitPrice("");
                    setResults([]);
                    setQuery(market.question);
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
          <div className="space-y-3">
            <p className="text-primary/80 truncate text-sm">
              {selected.question}
            </p>
            <div className="flex flex-wrap gap-2">
              {parseOutcomes(selected.outcomes).map((outcome) => {
                const cents = formatOutcomeCents(
                  selected.outcomes,
                  selected.outcomePrices,
                  outcome,
                );
                const isActive = selected.side === outcome;
                return (
                  <button
                    key={outcome}
                    type="button"
                    onClick={() => {
                      setSelected({ ...selected, side: outcome });
                      setLimitPrice("");
                    }}
                    className={`${chip} ${
                      isActive ? "!border-primary/40 !text-primary" : ""
                    }`}
                  >
                    {outcome}
                    {cents ? (
                      <span className="ml-1.5 font-mono tabular-nums">
                        {cents}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border-primary/10 rounded border p-2.5">
                <p className="text-primary/45 mb-1.5 text-xs font-medium">
                  Asks
                </p>
                <div className="space-y-0.5 font-mono text-xs tabular-nums">
                  {asks.length === 0 ? (
                    <p className="text-primary/35">—</p>
                  ) : (
                    asks.map((level) => (
                      <button
                        key={`ask-${level.price}-${level.size}`}
                        type="button"
                        onClick={() =>
                          setLimitPrice(
                            roundPrice(Number(level.price)).toFixed(2),
                          )
                        }
                        className="hover:bg-primary/5 flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-red-500/90"
                      >
                        <span>{priceLabel(Number(level.price))}</span>
                        <span className="text-primary/45">{level.size}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="border-primary/10 rounded border p-2.5">
                <p className="text-primary/45 mb-1.5 text-xs font-medium">
                  Bids
                </p>
                <div className="space-y-0.5 font-mono text-xs tabular-nums">
                  {bids.length === 0 ? (
                    <p className="text-primary/35">—</p>
                  ) : (
                    bids.map((level) => (
                      <button
                        key={`bid-${level.price}-${level.size}`}
                        type="button"
                        onClick={() =>
                          setLimitPrice(
                            roundPrice(Number(level.price)).toFixed(2),
                          )
                        }
                        className="hover:bg-primary/5 text-profit flex w-full items-center justify-between gap-2 rounded px-1 py-0.5"
                      >
                        <span>{priceLabel(Number(level.price))}</span>
                        <span className="text-primary/45">{level.size}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
            {bookError && (
              <p className="text-xs text-red-500/80">{bookError}</p>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[6rem] flex-1">
                <span className="text-primary/50 mb-1 block text-xs">
                  Amount ($)
                </span>
                <input
                  type="number"
                  min={1}
                  max={remainingDeployable > 0 ? remainingDeployable : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={field}
                />
              </label>
              <label className="min-w-[6rem] flex-1">
                <span className="text-primary/50 mb-1 block text-xs">
                  Limit price
                </span>
                <input
                  type="number"
                  min={0.01}
                  max={0.99}
                  step={0.01}
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="0.00"
                  className={field}
                />
              </label>
              <button
                type="button"
                disabled={busy || signing}
                onClick={() => void addToPreview()}
                className={`${walletNavButtonClass} !px-4 !py-2 disabled:opacity-40`}
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
                    · {formatUsdExact(queuedBuyTotal)} queued ·{" "}
                    {formatUsdExact(deployable)} total
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {previewQueue.length > 0 && (
          <div className="border-primary/10 rounded border text-xs">
            <div className="border-primary/10 flex items-center justify-between gap-2 border-b px-3 py-2">
              <p className="text-primary/50 truncate">
                Preview · {previewQueue.length}
                {queuedBuyTotal > 0 && ` · ${formatUsdExact(queuedBuyTotal)}`}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPreviewQueue([])}
                className="text-primary/50 hover:text-primary disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            {previewQueue.map((trade) => (
              <div
                key={trade.id}
                className="border-primary/10 flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0"
              >
                <p className="text-primary/80 min-w-0 flex-1 truncate text-sm">
                  {trade.question}
                  <span className="text-primary/50 ml-2">
                    {trade.side} · {priceLabel(trade.price)} ·{" "}
                    {formatUsdExact(trade.totalUsdc)}
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
            ))}
            <div className="border-primary/10 border-t px-3 py-2">
              <button
                type="button"
                disabled={busy || signing}
                onClick={() => void executeAll()}
                className={`${walletNavButtonClass} w-full !py-2 disabled:opacity-40`}
              >
                {signing
                  ? "Sign…"
                  : busy
                    ? "…"
                    : `Execute (${previewQueue.length})`}
              </button>
            </div>
          </div>
        )}
      </div>

      {notice && <p className="text-profit mt-3 text-sm">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
