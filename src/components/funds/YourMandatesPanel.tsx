import { useEffect, useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import WalletPanelPlaceholder from "@/components/app/WalletPanelPlaceholder";
import MandateAllocationChart from "@/components/funds/MandateAllocationChart";
import { isFundInactive } from "@/lib/funds/lifecycle";
import type { Fund, Mandate } from "@/lib/funds/types";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";

type Entry = {
  fund: Fund;
  mandate: Mandate;
  profitUsdc: number | null;
};

export default function YourMandatesPanel() {
  const { address, isConnected, loading: walletLoading } = useWalletGate();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (walletLoading || !isConnected || !address) {
      setEntries(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/investor/mandates?address=${encodeURIComponent(address!)}`,
        );
        const data = (await res.json()) as {
          mandates?: Array<{
            fund: Fund;
            mandate: Mandate;
            mandateProfitUsdc?: number | null;
          }>;
          error?: string;
        };
        if (!cancelled) {
          if (!res.ok) {
            setEntries([]);
            return;
          }
          setEntries(
            (data.mandates ?? []).map((row) => ({
              fund: row.fund,
              mandate: row.mandate,
              profitUsdc: row.mandateProfitUsdc ?? null,
            })),
          );
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
  }, [address, isConnected, walletLoading]);

  // Closed/archived funds and non-active mandates are not portfolio capital.
  const visibleEntries = (entries ?? []).filter(
    ({ fund, mandate }) =>
      mandate.status === "active" && !isFundInactive(fund),
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
            Your portfolio
          </span>
        </div>
      </div>

      {isConnected && address ? (
        loading || entries === null ? (
          <div className="border-primary/10 border-t">
            <MandateAllocationChart entries={[]} loading />
          </div>
        ) : (
          <div className="border-primary/10 border-t">
            <MandateAllocationChart entries={visibleEntries} />
          </div>
        )
      ) : (
        <>
          <div data-wallet-restoring className="border-primary/10 border-t pt-4">
            <WalletPanelPlaceholder label="Loading wallet…" />
          </div>
          <div
            className="border-primary/10 border-t pt-4"
            data-wallet-connect-cta
          >
            <p className="text-primary/55 text-sm leading-relaxed">
              Connect your wallet to see the funds you're in.
            </p>
            <div className="mt-4 max-w-56">
              <ConnectWallet variant="panel" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
