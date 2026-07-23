import { useEffect, useMemo, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { formatUsdExact } from "@/lib/funds/format";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import type { FanoutSlice, Fund, MarketSide, VirtualPool } from "@/lib/funds/types";
import {
  formatOutcomeCents,
  parseOutcomes,
  tokenIdForSide,
  type SearchMarket,
} from "@/lib/polymarket/gamma";
import { readResponseJson } from "@/lib/fetch-json";
import { walletNavButtonClass, walletNavRadius } from "@/lib/walletNavChrome";
import { signWalletMessage } from "@/lib/wagmi/signMessage";

type Props = {
  open: boolean;
  fund: Fund;
  address: `0x${string}`;
  onClose: () => void;
};

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

const shell =
  "flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#181709] text-white shadow-[0px_0px_40px_-8px_rgba(0,0,0,0.45)]";
const field =
  "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none";
const chip =
  "rounded-[12px] border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium uppercase transition-colors hover:bg-white/15";

function roundPrice(n: number) {
  return Math.round(n * 100) / 100;
}

function priceLabel(price: number) {
  return `$${Number(price).toFixed(1)}`;
}

export default function NewTradeModal({
  open,
  fund,
  address,
  onClose,
}: Props) {
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
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/funds/${fund.slug}/pool?address=${encodeURIComponent(address)}`,
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
  }, [open, fund.slug, address]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, query]);

  useEffect(() => {
    if (!open || !selectedTokenId) {
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
          .slice(0, 8);
        const nextAsks = (data.asks ?? [])
          .slice()
          .sort((a, b) => Number(a.price) - Number(b.price))
          .slice(0, 8);
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
  }, [open, selectedTokenId]);

  if (!open) return null;

  async function requestChallenge() {
    const params = new URLSearchParams({
      address,
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

      const drafts = [
        ...previewQueue.map((trade) => ({
          gammaMarketId: trade.gammaMarketId,
          tokenId: trade.tokenId,
          side: trade.side,
          totalUsdc: trade.totalUsdc,
          price: trade.price,
          orderSide: "BUY" as const,
        })),
        {
          gammaMarketId: selected.gammaMarketId,
          side: selected.side,
          totalUsdc: tradeAmount,
          price,
          orderSide: "BUY" as const,
        },
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
      const data = await readResponseJson<{
        trades?: PlannedTrade[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      if (!data.trades?.length) throw new Error("Preview failed");

      setPreviewQueue(
        data.trades.map((trade, index) => ({
          ...trade,
          id:
            previewQueue[index]?.id ??
            `${trade.tokenId}-BUY-${Date.now()}-${index}`,
        })),
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
          trades: previewQueue.map((trade) => ({
            gammaMarketId: trade.gammaMarketId,
            tokenId: trade.tokenId,
            side: trade.side,
            totalUsdc: trade.totalUsdc,
            price: trade.price,
            orderSide: "BUY" as const,
          })),
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

  async function removeFromPreview(id: string) {
    const next = previewQueue.filter((trade) => trade.id !== id);
    if (next.length === previewQueue.length) return;
    setBusy(true);
    setError(null);
    try {
      if (next.length === 0) {
        setPreviewQueue([]);
        return;
      }
      const res = await fetch(`/api/funds/${fund.slug}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerAddress: address,
          trades: next.map((trade) => ({
            gammaMarketId: trade.gammaMarketId,
            tokenId: trade.tokenId,
            side: trade.side,
            totalUsdc: trade.totalUsdc,
            price: trade.price,
            orderSide: "BUY" as const,
          })),
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
          id: next[index]?.id ?? `${trade.tokenId}-${index}`,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FloatingPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-trade-title"
          className={shell}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h2
                id="new-trade-title"
                className="text-base font-semibold text-white"
              >
                New trade
              </h2>
              <p className="mt-2 text-sm text-white/50">
                Set a limit price against the live orderbook, then fan out across
                the pool.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or paste Polymarket URL…"
              className={field}
            />
            {searching && <p className="text-xs text-white/45">Searching…</p>}
            {results.length > 0 && (
              <ul className="max-h-36 overflow-y-auto rounded-xl border border-white/10">
                {results.map((market) => (
                  <li key={market.gammaMarketId} className="border-b border-white/10 last:border-b-0">
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
                      className="w-full px-3 py-2.5 text-left text-sm text-white/85 hover:bg-white/5"
                    >
                      {market.question}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selected && (
              <div className="space-y-3">
                <p className="truncate text-sm text-white/80">
                  {selected.question}
                </p>
                <div className="flex flex-wrap gap-2">
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
                        onClick={() => {
                          setSelected({ ...selected, side: outcome });
                          setLimitPrice("");
                        }}
                        className={`${chip} ${
                          active ? "border-white/50 bg-white/20 text-white" : "text-white/55"
                        }`}
                      >
                        {outcome}
                        {cents ? (
                          <span className="ml-1.5 font-mono tabular-nums normal-case">
                            {cents}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">
                      Asks
                    </p>
                    <div className="space-y-1 font-mono text-xs tabular-nums">
                      {asks.length === 0 ? (
                        <p className="text-white/35">—</p>
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
                            className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-red-300/90 hover:bg-white/5"
                          >
                            <span>{priceLabel(Number(level.price))}</span>
                            <span className="text-white/45">{level.size}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/45">
                      Bids
                    </p>
                    <div className="space-y-1 font-mono text-xs tabular-nums">
                      {bids.length === 0 ? (
                        <p className="text-white/35">—</p>
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
                            className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-emerald-300/90 hover:bg-white/5"
                          >
                            <span>{priceLabel(Number(level.price))}</span>
                            <span className="text-white/45">{level.size}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                {bookError && (
                  <p className="text-xs text-red-300/80">{bookError}</p>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[7rem] flex-1">
                    <span className="mb-1 block text-xs text-white/50">
                      Amount ($)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={
                        remainingDeployable > 0
                          ? remainingDeployable
                          : undefined
                      }
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={field}
                    />
                  </label>
                  <label className="min-w-[7rem] flex-1">
                    <span className="mb-1 block text-xs text-white/50">
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
                    className={`${walletNavButtonClass} !px-4 disabled:opacity-40`}
                  >
                    {busy ? "…" : "Add"}
                  </button>
                </div>
                {deployable > 0 && (
                  <p className="text-xs text-white/45">
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
              <div className="rounded-xl border border-white/10 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                  <p className="truncate uppercase text-white/45">
                    Preview · {previewQueue.length}
                    {queuedBuyTotal > 0 && ` · ${formatUsdExact(queuedBuyTotal)}`}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPreviewQueue([])}
                    className="uppercase text-white/45 hover:text-white disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
                {previewQueue.map((trade) => (
                  <div
                    key={trade.id}
                    className="border-b border-white/10 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <p className="min-w-0 flex-1 truncate text-sm text-white/80">
                        {trade.question}
                        <span className="ml-2 uppercase text-white/45">
                          {trade.side} · {priceLabel(trade.price)} ·{" "}
                          {formatUsdExact(trade.totalUsdc)}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => void removeFromPreview(trade.id)}
                        className="shrink-0 p-1 text-white/40 hover:text-white"
                        aria-label="Remove trade from preview"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {notice && <p className="text-sm text-emerald-300">{notice}</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
          </div>

          <div className="flex shrink-0 gap-3 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              disabled={busy || signing || previewQueue.length === 0}
              onClick={() => void executeAll()}
              className={`${walletNavButtonClass} flex-1 border border-white/20 disabled:opacity-40`}
            >
              {signing
                ? "Sign…"
                : busy
                  ? "…"
                  : previewQueue.length
                    ? `Execute (${previewQueue.length})`
                    : "Execute"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 border border-white/25 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 ${walletNavRadius}`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
