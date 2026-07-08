import { useEffect, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { MarketSide } from "@/lib/funds/types";
import type { SearchMarket } from "@/lib/polymarket/gamma";
import { usePolymarketProfile } from "@/lib/polymarket/usePolymarketProfile";
import WagmiScope from "@/components/app/WagmiScope";
import ConnectWallet from "@/components/app/ConnectWallet";

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

function RemoveIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function CreateFundForm() {
  return (
    <WagmiScope>
      <CreateFundFormInner />
    </WagmiScope>
  );
}

function CreateFundFormInner() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [name, setName] = useState("");
  const [thesis, setThesis] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchMarket[]>([]);
  const [selected, setSelected] = useState<SelectedMarket[]>([]);
  const { name: managerName } = usePolymarketProfile(address);

  const totalWeight = useMemo(
    () => selected.reduce((sum, m) => sum + m.weight, 0),
    [selected],
  );

  const weightsValid = selected.length > 0 && totalWeight === 100;
  const canPublish =
    isConnected &&
    address &&
    name.trim() &&
    thesis.trim() &&
    weightsValid;
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

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

  async function publish() {
    if (!canPublish || publishing || !address) return;

    setPublishing(true);
    setPublishError(null);

    try {
      const challengeRes = await fetch(
        `/api/auth/publish-challenge?address=${encodeURIComponent(address)}`,
      );
      const challenge = await challengeRes.json();
      if (!challengeRes.ok) {
        throw new Error(challenge.error ?? "Could not start publish");
      }

      const signature = await signMessageAsync({ message: challenge.message });

      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          thesis: thesis.trim(),
          managerAddress: address,
          message: challenge.message,
          signature,
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
      if (!res.ok) throw new Error(data.error ?? "Could not publish fund");

      window.location.href = `/funds/${data.slug}`;
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Could not publish fund");
      setPublishing(false);
    }
  }

  const inputClass =
    "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";

  return (
    <form className="mt-10 space-y-6" onSubmit={(e) => e.preventDefault()}>
      <div>
        <p className="text-primary mb-2 text-sm">Creator</p>
        <ConnectWallet variant="create" />
        {managerName && (
          <p className="text-primary/60 mt-2 text-xs">
            Publishing as <span className="text-primary">{managerName}</span>
          </p>
        )}
      </div>

      <div>
        <label className="text-primary mb-1 block text-sm" htmlFor="name">
          Fund name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nothing Ever Happens"
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-primary mb-1 block text-sm" htmlFor="thesis">
          Thesis
        </label>
        <textarea
          id="thesis"
          rows={3}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Nothing ever happens in crypto. All positions are NO on hype markets."
          className={inputClass}
        />
      </div>

      <div>
        <label className="text-primary mb-1 block text-sm" htmlFor="market-search">
          Markets
        </label>

        <input
          id="market-search"
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
              <li key={market.gammaMarketId} className="border-primary/10 border-b last:border-0">
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

        {selected.length > 0 ? (
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
                    <span className="text-primary/40 pr-1.5 text-[0.65rem]">%</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeMarket(market.gammaMarketId)}
                    className="text-primary/40 hover:text-red-400 hover:bg-red-500/10 flex size-7 shrink-0 items-center justify-center rounded transition-colors"
                    aria-label="Remove market"
                  >
                    <RemoveIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-primary/50 mt-3 text-xs">
            Search and add at least one Polymarket market.
          </p>
        )}
      </div>

      {publishError && (
        <p className="text-red-400 text-sm">{publishError}</p>
      )}

      <button
        type="button"
        onClick={publish}
        disabled={!canPublish || publishing || signing}
        className="bg-accent hover:bg-accent/80 disabled:bg-accent/40 flex h-11 items-center justify-center rounded-full px-5 text-base font-medium text-white transition-all disabled:cursor-not-allowed"
      >
        {signing
          ? "Sign in wallet…"
          : publishing
            ? "Publishing…"
            : "Publish fund"}
      </button>
    </form>
  );
}
