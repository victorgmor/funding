import { useEffect, useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import GearIcon from "@/components/fundations/icons/GearIcon";
import MandateAllocationChart from "@/components/funds/MandateAllocationChart";
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
        <div className="border-primary/10 border-t">
          <MandateAllocationChart entries={[]} />
        </div>
      ) : (
        <div className="border-primary/10 border-t">
          <MandateAllocationChart entries={visibleEntries} />
        </div>
      )}
    </div>
  );
}
