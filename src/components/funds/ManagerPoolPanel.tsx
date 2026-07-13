import { useEffect, useMemo, useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import { isFundOwner } from "@/lib/funds/editable";
import { formatUsdExact } from "@/lib/funds/format";
import type { Fund, FanoutSlice, VirtualPool } from "@/lib/funds/types";
import type { MarketSide } from "@/lib/funds/types";
import { parseOutcomes, type SearchMarket } from "@/lib/polymarket/gamma";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = { fund: Fund };

type DryRun = {
  totalUsdc: number;
  price: number;
  tokenId: string;
  question: string;
  side: MarketSide;
  slices: FanoutSlice[];
};

export default function ManagerPoolPanel({ fund }: Props) {
  const { address, isConnected, restoring } = useWalletSession();
  const isOwner = isFundOwner(fund, address);

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
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const totalNotional = pool?.totalNotional ?? 0;

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

  async function submitInstruction(execute: boolean) {
    if (!selected || !address || busy) return;

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
          gammaMarketId: selected.gammaMarketId,
          side: selected.side,
          totalUsdc: Number(amount),
          dryRun: !execute,
          execute,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Instruction failed");

      if (execute) {
        setDryRun(null);
        const poolRes = await fetch(
          `/api/funds/${fund.slug}/pool?address=${encodeURIComponent(address)}`,
        );
        const poolData = await poolRes.json();
        if (poolRes.ok) setPool(poolData);

        const execSummary = data.summary as {
          pending?: number;
          withSession?: number;
          withoutSession?: number;
        } | undefined;
        if (execSummary?.pending) {
          setNotice(
            execSummary.withoutSession
              ? `Instruction recorded — ${execSummary.pending} slice(s) queued. ${execSummary.withoutSession} investor(s) need to authorize auto-trading.`
              : `Instruction recorded — ${execSummary.pending} slice(s) queued for autopilot.`,
          );
        } else {
          setNotice("Instruction recorded.");
        }
      } else {
        setDryRun(data as DryRun);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Instruction failed");
    } finally {
      setBusy(false);
    }
  }

  const sliceSummary = useMemo(() => {
    if (!dryRun) return null;
    return dryRun.slices.reduce((sum, s) => sum + s.usdcAmount, 0);
  }, [dryRun]);

  if (!isOwner) return null;

  const inputClass =
    "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";

  return (
    <div className="border-primary/10 border-b pb-4">
      <p className="text-primary text-sm font-medium">Fund pool</p>
      <p className="text-primary/60 mt-1 text-xs">
        Manager view — pooled AUM with per-investor fan-out from their wallets.
      </p>

      {restoring ? (
        <p className="text-primary/50 mt-3 text-sm">Loading wallet…</p>
      ) : !isConnected || !address ? (
        <div className="mt-3">
          <ConnectWallet variant="panel" />
        </div>
      ) : loading && !pool ? (
        <p className="text-primary/50 mt-3 text-sm">Loading pool…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-primary/50 text-[0.65rem] uppercase">AUM</p>
              <p className="text-primary font-mono text-xl tabular-nums">
                {formatUsdExact(totalNotional)}
              </p>
            </div>
            <div>
              <p className="text-primary/50 text-[0.65rem] uppercase">Deployable</p>
              <p className="text-primary font-mono text-xl tabular-nums">
                {formatUsdExact(pool?.totalCash ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-primary/50 text-[0.65rem] uppercase">Investors</p>
              <p className="text-primary font-mono text-xl tabular-nums">
                {pool?.mandateCount ?? 0}
              </p>
            </div>
          </div>

          {pool && pool.mandates.length > 0 && (
            <ul className="border-primary/10 mt-4 divide-y divide-primary/10 rounded border text-xs">
              {pool.mandates.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-primary/70 font-mono">{m.investorWallet}</span>
                  <span className="text-primary font-mono tabular-nums">
                    {formatUsdExact(m.notionalUsdc)}
                    <span className="text-primary/40 ml-1">
                      ({formatUsdExact(m.cashUsdc)} cash)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {fund.status === "trading" && (
            <div className="mt-4 space-y-3 border-t border-primary/10 pt-4">
              <p className="text-primary/50 text-[0.65rem] font-medium uppercase">
                New trade
              </p>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or paste Polymarket URL…"
                className={inputClass}
              />
              {searching && (
                <p className="text-primary/50 text-xs">Searching…</p>
              )}
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
                <>
                  <p className="text-primary/80 line-clamp-2 text-sm">
                    {selected.question}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {parseOutcomes(selected.outcomes).map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() => setSelected({ ...selected, side: outcome })}
                        className={
                          selected.side === outcome
                            ? "rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs uppercase"
                            : "text-primary/50 px-3 py-1 text-xs uppercase"
                        }
                      >
                        {outcome}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={inputClass}
                    placeholder="Pool trade size ($)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || signing}
                      onClick={() => submitInstruction(false)}
                      className="border-primary/10 text-primary hover:bg-primary/10 rounded-full border px-4 py-2 text-xs font-medium uppercase"
                    >
                      {busy ? "…" : "Preview fan-out"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || signing || !dryRun}
                      onClick={() => submitInstruction(true)}
                      className="bg-accent hover:opacity-90 rounded-full px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      {signing ? "Sign…" : "Execute instruction"}
                    </button>
                  </div>
                </>
              )}

              {dryRun && (
                <div className="border-primary/10 rounded border text-xs">
                  <p className="border-primary/10 border-b px-3 py-2 text-[0.65rem] uppercase text-primary/50">
                    Fan-out preview · {formatUsdExact(sliceSummary ?? 0)}
                  </p>
                  <ul className="divide-y divide-primary/10">
                    {dryRun.slices.map((slice) => (
                      <li
                        key={slice.mandateId}
                        className="flex justify-between gap-2 px-3 py-2"
                      >
                        <span className="text-primary/70 font-mono">
                          {slice.investorWallet.slice(0, 8)}…
                        </span>
                        <span className="text-primary font-mono tabular-nums">
                          {formatUsdExact(slice.usdcAmount)}
                          <span className="text-primary/40 ml-1">
                            ({(slice.poolShare * 100).toFixed(0)}%)
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {notice && <p className="text-emerald-400 mt-3 text-sm">{notice}</p>}
      {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
    </div>
  );
}
