import { useEffect, useMemo, useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import { isCreatorWallet } from "@/lib/funds/creator";
import { isFundOwner, isUserFund } from "@/lib/funds/editable";
import type { Fund, MarketSide } from "@/lib/funds/types";
import type { SearchMarket } from "@/lib/polymarket/gamma";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  fund: Fund;
};

type SelectedMarket = SearchMarket & {
  side: MarketSide;
  weight: number;
};

function equalWeights(count: number): number[] {
  if (count === 0) return [];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function redistribute(items: SelectedMarket[]): SelectedMarket[] {
  const weights = equalWeights(items.length);
  return items.map((item, i) => ({ ...item, weight: weights[i]! }));
}

async function signBundleAction(message: string) {
  const signature = await signWalletMessage(message);
  return { message, signature };
}

export default function FundOwnerControls({ fund }: Props) {
  if (!isUserFund(fund) || !isCreatorWallet(fund.manager.id)) return null;
  return <FundOwnerControlsInner fund={fund} />;
}

export function FundOwnerControlsInner({ fund }: Props) {
  if (!isUserFund(fund) || !isCreatorWallet(fund.manager.id)) return null;

  const { address, walletAddress, isConnected, restoring } = useWalletSession();
  const [signing, setSigning] = useState(false);

  const isOwner = isFundOwner(fund, walletAddress);

  const [managing, setManaging] = useState(false);
  const [name, setName] = useState(fund.name);
  const [thesis, setThesis] = useState(fund.thesis);
  const [unlockPrice, setUnlockPrice] = useState(
    fund.unlockPriceUsdc != null ? String(fund.unlockPriceUsdc) : "",
  );
  const [selected, setSelected] = useState<SelectedMarket[]>([]);
  const [loadedMarkets, setLoadedMarkets] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchMarket[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalWeight = useMemo(
    () => selected.reduce((sum, m) => sum + m.weight, 0),
    [selected],
  );
  const weightsValid = selected.length > 0 && totalWeight === 100;
  const canSave =
    isOwner && name.trim() && thesis.trim() && weightsValid && fund.status === "trading";

  useEffect(() => {
    if (!managing || loadedMarkets) return;

    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/funds/${fund.slug}/edit`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load bundle");
        setName(data.name);
        setThesis(data.thesis);
        setUnlockPrice(
          data.unlockPriceUsdc != null ? String(data.unlockPriceUsdc) : "",
        );
        setSelected(data.markets);
        setLoadedMarkets(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load bundle");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [managing, loadedMarkets, fund.slug]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    const id = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(
          `/api/polymarket/search?q=${encodeURIComponent(q)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setResults(data.markets ?? []);
      } catch (e) {
        if (cancelled) return;
        setResults([]);
        setSearchError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  function addMarket(market: SearchMarket) {
    if (selected.some((m) => m.gammaMarketId === market.gammaMarketId)) return;
    setSelected((prev) =>
      redistribute([...prev, { ...market, side: "no", weight: 0 }]),
    );
    setQuery("");
    setResults([]);
  }

  function removeMarket(id: string) {
    setSelected((prev) => redistribute(prev.filter((m) => m.gammaMarketId !== id)));
  }

  function setSide(id: string, side: MarketSide) {
    setSelected((prev) =>
      prev.map((m) => (m.gammaMarketId === id ? { ...m, side } : m)),
    );
  }

  function setWeight(id: string, weight: number) {
    setSelected((prev) =>
      prev.map((m) =>
        m.gammaMarketId === id
          ? { ...m, weight: Math.max(0, Math.min(100, weight)) }
          : m,
      ),
    );
  }

  async function requestChallenge(action: "manage" | "close") {
    if (!address) throw new Error("Connect your wallet first");
    const params = new URLSearchParams({ address, action, slug: fund.slug });
    const res = await fetch(`/api/auth/bundle-challenge?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not start signing");
    return data.message as string;
  }

  async function saveChanges() {
    if (!canSave || !address || busy) return;

    setBusy(true);
    setError(null);

    try {
      const message = await requestChallenge("manage");
      setSigning(true);
      const { signature } = await signBundleAction(message).finally(() =>
        setSigning(false),
      );

      const res = await fetch(`/api/funds/${fund.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          thesis: thesis.trim(),
          managerAddress: address,
          message,
          signature,
          unlockPriceUsdc: unlockPrice.trim()
            ? Number(unlockPrice)
            : null,
          markets: selected.map((market) => ({
            gammaMarketId: market.gammaMarketId,
            conditionId: market.conditionId,
            clobTokenIds: market.clobTokenIds,
            outcomes: market.outcomes,
            question: market.question,
            side: market.side,
            weight: market.weight,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save changes");

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes");
      setBusy(false);
    }
  }

  async function closeBundle() {
    if (!isOwner || !address || busy || fund.status === "closed") return;
    if (
      !window.confirm(
        "Close this bundle? New entries will be blocked. Existing positions can still exit.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const message = await requestChallenge("close");
      setSigning(true);
      const { signature } = await signBundleAction(message).finally(() =>
        setSigning(false),
      );

      const res = await fetch(`/api/funds/${fund.slug}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerAddress: address,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not close bundle");

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close bundle");
      setBusy(false);
    }
  }

  const inputClass =
    "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";

  if (!isOwner) return null;

  if (!isConnected || !address) {
    return (
      <div className="border-primary/10 bg-primary/5 mb-4 rounded-lg border p-4">
        <p className="text-primary text-sm font-medium">Creator controls</p>
        <p className="text-primary/60 mt-1 text-xs">
          {restoring
            ? "Restoring wallet…"
            : "Connect the wallet that created this bundle to edit or close it."}
        </p>
        {!restoring && (
          <div className="mt-3">
            <ConnectWallet variant="panel" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-primary/10 bg-primary/5 mb-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-medium">Creator controls</p>
          {fund.status === "closed" ? (
            <p className="text-primary/60 mt-1 text-xs">
              This bundle is closed. New entries are disabled.
            </p>
          ) : (
            <p className="text-primary/60 mt-1 text-xs">
              You created this bundle. Edit details or close it to new investors.
            </p>
          )}
        </div>

        {fund.status === "trading" && !managing && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setManaging(true)}
              disabled={busy}
              className="border-primary/10 text-primary hover:bg-primary/10 rounded-full border px-4 py-1.5 text-xs font-medium uppercase"
            >
              Manage
            </button>
            <button
              type="button"
              onClick={closeBundle}
              disabled={busy || signing}
              className="border-red-500/30 text-red-300 hover:bg-red-500/10 rounded-full border px-4 py-1.5 text-xs font-medium uppercase"
            >
              {signing ? "Sign…" : busy ? "Closing…" : "Close"}
            </button>
          </div>
        )}
      </div>

      {managing && fund.status === "trading" && (
        <div className="mt-4 space-y-4 border-t border-primary/10 pt-4">
          {!loadedMarkets ? (
            <p className="text-primary/50 text-sm">Loading markets…</p>
          ) : (
            <>
              <div>
                <label className="text-primary mb-1 block text-sm" htmlFor="edit-name">
                  Fund name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-primary mb-1 block text-sm" htmlFor="edit-thesis">
                  Thesis
                </label>
                <textarea
                  id="edit-thesis"
                  rows={3}
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  className="text-primary mb-1 block text-sm"
                  htmlFor="edit-unlock-price"
                >
                  Unlock price (pUSD)
                </label>
                <input
                  id="edit-unlock-price"
                  type="number"
                  min={1}
                  step="0.01"
                  value={unlockPrice}
                  onChange={(e) => setUnlockPrice(e.target.value)}
                  placeholder="Leave empty for free"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  className="text-primary mb-1 block text-sm"
                  htmlFor="edit-market-search"
                >
                  Markets
                </label>
                <input
                  id="edit-market-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Polymarket…"
                  className={inputClass}
                  autoComplete="off"
                />
                {searching && (
                  <p className="text-primary/50 mt-2 text-xs">Searching…</p>
                )}
                {searchError && (
                  <p className="text-red-400 mt-2 text-xs">{searchError}</p>
                )}
                {results.length > 0 && (
                  <ul className="border-primary/10 bg-primary/5 mt-2 max-h-48 overflow-y-auto rounded border">
                    {results.map((market) => (
                      <li
                        key={market.gammaMarketId}
                        className="border-primary/10 border-b last:border-0"
                      >
                        <button
                          type="button"
                          onClick={() => addMarket(market)}
                          disabled={selected.some(
                            (m) => m.gammaMarketId === market.gammaMarketId,
                          )}
                          className="text-primary hover:bg-primary/10 disabled:text-primary/30 w-full px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed"
                        >
                          {market.question}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {selected.length > 0 && (
                  <ul className="border-primary/10 bg-primary/5 mt-4 divide-y divide-primary/10 overflow-hidden rounded border">
                    {selected.map((market) => (
                      <li key={market.gammaMarketId} className="px-3 py-3">
                        <p className="text-primary line-clamp-2 text-sm leading-snug">
                          {market.question}
                        </p>
                        <div className="mt-2.5 flex items-center justify-end gap-2">
                          <div className="border-primary/10 flex shrink-0 overflow-hidden rounded border">
                            {(["yes", "no"] as const).map((side) => (
                              <button
                                key={side}
                                type="button"
                                onClick={() => setSide(market.gammaMarketId, side)}
                                className={
                                  market.side === side
                                    ? side === "yes"
                                      ? "bg-emerald-500/20 px-2 py-1 text-[0.65rem] font-medium uppercase text-emerald-300"
                                      : "bg-red-500/20 px-2 py-1 text-[0.65rem] font-medium uppercase text-red-300"
                                    : "text-primary/40 hover:text-primary/70 px-2 py-1 text-[0.65rem] font-medium uppercase"
                                }
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                          <div className="border-primary/10 flex shrink-0 items-center rounded border">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={market.weight}
                              onChange={(e) =>
                                setWeight(
                                  market.gammaMarketId,
                                  Number.parseInt(e.target.value, 10) || 0,
                                )
                              }
                              aria-label="Weight percent"
                              className="text-primary [appearance:textfield] w-10 border-0 bg-transparent py-1 text-center font-mono text-xs focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <span className="text-primary/40 pr-1.5 text-[0.65rem]">
                              %
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMarket(market.gammaMarketId)}
                            className="text-primary/40 hover:text-red-400 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveChanges}
                  disabled={!canSave || busy || signing}
                  className="bg-accent hover:bg-accent/80 disabled:bg-accent/40 rounded-full px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed"
                >
                  {signing
                    ? "Sign in wallet…"
                    : busy
                      ? "Saving…"
                      : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManaging(false);
                    setLoadedMarkets(false);
                    setError(null);
                  }}
                  disabled={busy}
                  className="text-primary/60 hover:text-primary text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
    </div>
  );
}
