import { useEffect, useState } from "react";
import ArrowRight from "@/components/fundations/icons/ArrowRight";
import ConnectWallet from "@/components/app/ConnectWallet";
import GearIcon from "@/components/fundations/icons/GearIcon";
import { formatUsdExact } from "@/lib/funds/format";
import { resolveLifecycleStage } from "@/lib/funds/lifecycle";
import type { Fund, Mandate } from "@/lib/funds/types";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  funds: Fund[];
};

type Entry = {
  fund: Fund;
  mandate: Mandate;
  profitUsdc: number | null;
};

export default function YourMandatesPanel({ funds }: Props) {
  const { address, isConnected, restoring } = useWalletSession();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hideClosed, setHideClosed] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setEntries(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const results = await Promise.all(
          funds.map(async (fund) => {
            const res = await fetch(
              `/api/funds/${fund.slug}/mandates?address=${encodeURIComponent(address!)}`,
            );
            const data = (await res.json()) as {
              mandate?: Mandate | null;
              mandateProfitUsdc?: number | null;
            };
            if (!res.ok || !(data.mandate?.notionalUsdc ?? 0)) return null;
            return {
              fund,
              mandate: data.mandate!,
              profitUsdc: data.mandateProfitUsdc ?? null,
            };
          }),
        );
        if (!cancelled) {
          setEntries(results.filter(Boolean) as Entry[]);
        }
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [funds, address, isConnected]);

  const visibleEntries = (entries ?? []).filter(
    ({ fund }) => !hideClosed || resolveLifecycleStage(fund) !== "closed",
  );

  return (
    <div>
      <div className="pb-5">
        <div
          aria-hidden
          className="invisible hidden items-center gap-2 pb-2 lg:flex"
        >
          <span className="size-4 shrink-0" />
          <input
            type="search"
            tabIndex={-1}
            readOnly
            className="w-full appearance-none border-0 bg-transparent py-1 text-base shadow-none"
          />
        </div>
        <div className="flex items-center justify-between lg:mt-4">
          <span className="border-primary text-primary inline-block border-b-2 pb-2 text-sm font-medium">
            Your mandates
          </span>
          <div className="flex items-center gap-2 pb-2">
            {settingsOpen && (
              <label className="text-primary flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={hideClosed}
                    onChange={(e) => setHideClosed(e.target.checked)}
                    className="border-primary/20 text-accent ring-0 size-3.5 shrink-0 rounded"
                  />
                  Hide closed funds
                </label>
            )}
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Mandates settings"
              aria-expanded={settingsOpen}
              className={`pb-2 transition-colors ${
                settingsOpen
                  ? "text-primary"
                  : "text-primary/45 hover:text-primary/70"
              }`}
            >
              <GearIcon className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {!isConnected ? (
        <div className="border-primary/10 border-t pt-4">
          <p className="text-primary/55 text-sm leading-relaxed">
            {restoring
              ? "Restoring wallet…"
              : "Connect your wallet to see the funds you're in."}
          </p>
          {!restoring && (
            <div className="mt-4 max-w-56">
              <ConnectWallet variant="panel" />
            </div>
          )}
        </div>
      ) : loading || entries === null ? (
        <p className="border-primary/10 text-primary/50 border-t pt-4 text-sm">
          Checking your mandates…
        </p>
      ) : entries.length === 0 ? (
        <p className="border-primary/10 text-primary/55 border-t pt-4 text-sm leading-relaxed">
          You&apos;re not in any funds yet. Pick a fund from the feed and commit
          capital to join.
        </p>
      ) : visibleEntries.length === 0 ? (
        <p className="border-primary/10 text-primary/55 border-t pt-4 text-sm leading-relaxed">
          All your funds are closed and hidden by your settings.
        </p>
      ) : (
        <div>
          {visibleEntries.map(({ fund, mandate, profitUsdc }, index) => {
            const deployed = Math.max(
              0,
              mandate.notionalUsdc - mandate.cashUsdc,
            );
            return (
              <a
                key={fund.slug}
                href={`/funds/${fund.slug}`}
                className={`border-primary/10 group block border-b py-4 last:border-b-0 ${
                  index === 0 ? "border-t" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <p className="text-primary group-hover:text-primary/85 truncate text-lg font-semibold tracking-tight sm:text-xl">
                      {fund.name}
                    </p>
                  </div>
                  <span className="text-primary/50 group-hover:text-primary shrink-0 transition-colors">
                    <ArrowRight size="sm" />
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <p className="text-primary font-mono text-lg tabular-nums">
                    {formatUsdExact(mandate.notionalUsdc)}
                  </p>
                  {profitUsdc != null && profitUsdc !== 0 && (
                    <p
                      className={`font-mono text-sm tabular-nums ${
                        profitUsdc > 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatUsdExact(profitUsdc, true)}
                    </p>
                  )}
                </div>
                <p className="text-primary/45 mt-2.5 font-mono text-xs tabular-nums">
                  {formatUsdExact(deployed)} deployed ·{" "}
                  {formatUsdExact(mandate.cashUsdc)} cash
                </p>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
