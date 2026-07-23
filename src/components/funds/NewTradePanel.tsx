import { useEffect, useMemo, useState } from "react";
import Skeleton from "@/components/app/Skeleton";
import { formatUsdExact } from "@/lib/funds/format";
import { isFundOwner } from "@/lib/funds/editable";
import { notifyPoolUpdated } from "@/lib/funds/pool-events";
import type { Fund, MarketSide, VirtualPool } from "@/lib/funds/types";
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

type RawBookLevel = { price: string; size: string };
type BookLevel = { price: number; size: number };

const field =
  "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";
const chip =
  "border-primary/10 bg-primary/5 text-primary/70 hover:text-primary rounded-[12px] border px-3 py-2 text-xs font-medium transition-colors";

function roundPrice(n: number) {
  return Math.round(n * 100) / 100;
}

function centsLabel(price: number) {
  return `${(price * 100).toFixed(1)}¢`;
}

function sharesLabel(size: number) {
  return size.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function notionalLabel(level: BookLevel) {
  const notional = level.price * level.size;
  return `$${notional.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

// Aggregate raw levels into one entry per cent price (Polymarket-style).
function groupByPrice(levels: RawBookLevel[]): BookLevel[] {
  const buckets = new Map<number, number>();
  for (const level of levels) {
    const price = roundPrice(Number(level.price));
    buckets.set(price, (buckets.get(price) ?? 0) + Number(level.size));
  }
  return [...buckets.entries()].map(([price, size]) => ({ price, size }));
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
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const active = isOwner && isConnected && Boolean(address);

  const remainingDeployable = Math.max(0, pool?.totalCash ?? 0);

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
    if (q.length < 2 || (selected && q === selected.question)) {
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
  }, [active, query, selected]);

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
          bids?: RawBookLevel[];
          asks?: RawBookLevel[];
          error?: string;
        }>(res);
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Orderbook unavailable");
        const nextBids = groupByPrice(data.bids ?? [])
          .sort((a, b) => b.price - a.price)
          .slice(0, 8);
        const nextAsks = groupByPrice(data.asks ?? [])
          .sort((a, b) => a.price - b.price)
          .slice(0, 8);
        setBids(nextBids);
        setAsks(nextAsks);
        setBookError(null);

        // Seed limit from best ask when empty / market just selected.
        if (!limitPrice && nextAsks[0]) {
          setLimitPrice(nextAsks[0].price.toFixed(2));
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

  async function executeTrade() {
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
          `Only ${formatUsdExact(remainingDeployable)} deployable`,
        );
      }

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
          trades: [
            {
              gammaMarketId: selected.gammaMarketId,
              side: selected.side,
              totalUsdc: tradeAmount,
              price,
              orderSide: "BUY" as const,
            },
          ],
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

      setSelected(null);
      setQuery("");
      setAmount("20");
      setLimitPrice("");
      setBids([]);
      setAsks([]);
      notifyPoolUpdated(fund.slug);

      const execSummary = data.summary;
      if (execSummary?.pending) {
        setNotice(
          execSummary.withoutSession
            ? `${execSummary.count ?? 1} instruction(s) recorded — ${execSummary.pending} slice(s) queued. ${execSummary.withoutSession} investor(s) need auto-trading.`
            : `${execSummary.count ?? 1} instruction(s) recorded — ${execSummary.pending} slice(s) queued for autopilot.`,
        );
        window.setTimeout(() => notifyPoolUpdated(fund.slug), 4000);
      } else {
        setNotice(`${execSummary?.count ?? 1} instruction(s) recorded.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Instruction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-4 pt-4">
      <div className="space-y-3">
        <p className="text-primary text-sm font-medium">New trade</p>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or paste Polymarket URL…"
          className={field}
        />
        {searching && results.length === 0 && (
          // Skeleton mirrors the results dropdown rows.
          <div aria-hidden className="border-primary/10 rounded border">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="border-primary/10 border-b px-3 py-2.5 last:border-b-0"
              >
                <Skeleton
                  className={`h-4 rounded ${row === 1 ? "w-1/2" : "w-2/3"}`}
                />
              </div>
            ))}
          </div>
        )}
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

            {(() => {
              // Asks stored best-first; show worst→best (best ask at bottom).
              const askRows = [...asks].reverse();
              const bestAsk = asks[0];
              const bestBid = bids[0];
              const last = bestBid?.price ?? bestAsk?.price;
              const spread =
                bestAsk && bestBid
                  ? bestAsk.price - bestBid.price
                  : null;
              const maxSize = Math.max(
                1,
                ...asks.map((l) => l.size),
                ...bids.map((l) => l.size),
              );
              const depthPct = (size: number) =>
                `${Math.min(100, (size / maxSize) * 100)}%`;
              const row =
                "relative grid w-full grid-cols-3 items-center gap-2 overflow-hidden px-2 py-0.5 text-left font-mono text-xs tabular-nums hover:bg-primary/5";
              return (
                <div className="border-primary/10 overflow-hidden rounded border">
                  <div className="text-primary/45 grid grid-cols-3 gap-2 px-2 py-1.5 text-[10px] font-medium tracking-wide uppercase">
                    <span>Price</span>
                    <span className="text-right">Shares</span>
                    <span className="text-right">Total</span>
                  </div>
                  {askRows.length === 0 && bids.length === 0 ? (
                    <p className="text-primary/35 px-2 py-2 text-xs">—</p>
                  ) : (
                    <>
                      {askRows.map((level) => {
                        const isBest = level.price === bestAsk?.price;
                        return (
                          <button
                            key={`ask-${level.price}`}
                            type="button"
                            onClick={() =>
                              setLimitPrice(level.price.toFixed(2))
                            }
                            className={row}
                          >
                            <span
                              aria-hidden
                              className="absolute inset-y-0 right-0 bg-red-500/10"
                              style={{ width: depthPct(level.size) }}
                            />
                            <span className="relative flex min-w-0 items-center gap-1.5 text-red-500/90">
                              {centsLabel(level.price)}
                              {isBest && (
                                <span className="border-red-500/25 bg-red-500/10 rounded border px-1 py-px text-[9px] font-sans font-medium tracking-normal text-red-500/70 normal-case">
                                  Asks
                                </span>
                              )}
                            </span>
                            <span className="text-primary/60 relative text-right">
                              {sharesLabel(level.size)}
                            </span>
                            <span className="text-primary/45 relative text-right">
                              {notionalLabel(level)}
                            </span>
                          </button>
                        );
                      })}
                      <div className="border-primary/10 bg-primary/5 flex items-center justify-between gap-3 border-y px-2 py-1.5 text-xs">
                        <span className="text-primary/50">
                          Last{" "}
                          <span className="text-primary font-mono tabular-nums">
                            {last != null ? centsLabel(last) : "—"}
                          </span>
                        </span>
                        <span className="text-primary/50">
                          Spread{" "}
                          <span className="text-primary font-mono tabular-nums">
                            {spread != null ? centsLabel(spread) : "—"}
                          </span>
                        </span>
                      </div>
                      {bids.map((level) => {
                        const isBest = level.price === bestBid?.price;
                        return (
                          <button
                            key={`bid-${level.price}`}
                            type="button"
                            onClick={() =>
                              setLimitPrice(level.price.toFixed(2))
                            }
                            className={row}
                          >
                            <span
                              aria-hidden
                              className="absolute inset-y-0 right-0 bg-emerald-500/10"
                              style={{ width: depthPct(level.size) }}
                            />
                            <span className="text-profit relative flex min-w-0 items-center gap-1.5">
                              {centsLabel(level.price)}
                              {isBest && (
                                <span className="border-emerald-500/25 bg-emerald-500/10 text-profit/70 rounded border px-1 py-px text-[9px] font-sans font-medium tracking-normal normal-case">
                                  Bids
                                </span>
                              )}
                            </span>
                            <span className="text-primary/60 relative text-right">
                              {sharesLabel(level.size)}
                            </span>
                            <span className="text-primary/45 relative text-right">
                              {notionalLabel(level)}
                            </span>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })()}
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
                onClick={() => void executeTrade()}
                className={`${walletNavButtonClass} !px-4 !py-2 disabled:opacity-40`}
              >
                {signing ? "Sign…" : busy ? "…" : "Trade"}
              </button>
            </div>
            {remainingDeployable > 0 && (
              <p className="text-primary/50 text-xs">
                {formatUsdExact(remainingDeployable)} deployable
              </p>
            )}
          </div>
        )}
      </div>

      {notice && <p className="text-profit mt-3 text-sm">{notice}</p>}
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
