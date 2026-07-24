import { useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import LazyProviders from "@/components/app/LazyProviders";
import WalletPanelPlaceholder from "@/components/app/WalletPanelPlaceholder";
import { isFundOwner, isUserFund } from "@/lib/funds/editable";
import {
  resolveLifecycleStage,
  type LifecycleStage,
} from "@/lib/funds/lifecycle";
import type { Fund } from "@/lib/funds/types";
import { usePoolTotals } from "@/lib/funds/usePoolTotals";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletGate } from "@/lib/wagmi/useWalletGate";
import { walletNavButtonClass } from "@/lib/walletNavChrome";
import { readResponseJson } from "@/lib/fetch-json";

type Props = { fund: Fund };

const STAGES: { id: LifecycleStage; label: string }[] = [
  { id: "deposit", label: "Open for orders" },
  { id: "trading", label: "Trading" },
  { id: "closed", label: "Closed" },
];

export default function FundLifecycleTestPanel(props: Props) {
  return (
    <LazyProviders>
      <FundLifecycleTestPanelInner {...props} />
    </LazyProviders>
  );
}

function FundLifecycleTestPanelInner({ fund }: Props) {
  const { address, walletAddress, isConnected, loading } = useWalletGate();
  const { totals } = usePoolTotals();
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isUserFund(fund)) return null;
  if (!loading && !isFundOwner(fund, walletAddress)) return null;

  const totalNotional = totals[fund.slug]?.deposited ?? 0;
  const currentStage = resolveLifecycleStage(fund, Date.now(), totalNotional);

  if (loading) {
    return (
      <div className="border-primary/10 bg-primary/5 mt-3 rounded-lg border border-dashed px-4 py-3">
        <p className="text-primary/50 text-base font-medium uppercase">
          Test lifecycle
        </p>
        <div data-wallet-restoring>
          <WalletPanelPlaceholder className="mt-2" label="Loading wallet…" />
        </div>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="border-primary/10 bg-primary/5 mt-3 rounded-lg border border-dashed px-4 py-3">
        <p className="text-primary/50 text-base font-medium uppercase">
          Test lifecycle
        </p>
        <div className="mt-2" data-wallet-connect-cta>
          <p className="text-primary/60 mb-2 text-base">
            Connect your creator wallet to switch stages.
          </p>
          <ConnectWallet variant="panel" />
        </div>
      </div>
    );
  }

  async function setStage(stage: LifecycleStage) {
    if (!address || busy || stage === currentStage) return;

    setBusy(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        address,
        action: "manage",
        slug: fund.slug,
      });
      const challengeRes = await fetch(`/api/auth/bundle-challenge?${params}`);
      const challengeData = await readResponseJson<{
        error?: string;
        message?: string;
      }>(challengeRes);
      if (!challengeRes.ok) {
        throw new Error(challengeData.error ?? "Could not start signing");
      }

      setSigning(true);
      const signature = await signWalletMessage(
        challengeData.message as string,
      ).finally(() => setSigning(false));

      const res = await fetch(`/api/funds/${fund.slug}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          managerAddress: address,
          message: challengeData.message,
          signature,
        }),
      });

      const data = await readResponseJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Could not update stage");

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update stage");
      setBusy(false);
    }
  }

  return (
    <div className="border-primary/10 bg-primary/5 mt-3 rounded-lg border border-dashed px-4 py-3">
      <p className="text-primary/50 text-base font-medium uppercase">
        Test lifecycle
      </p>
      <>
          {currentStage === "deposit" && (
            <button
              type="button"
              disabled={busy || signing}
              onClick={() => setStage("trading")}
              className={`${walletNavButtonClass} mt-2 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {signing
                ? "Sign in wallet…"
                : busy
                  ? "Starting trading…"
                  : "Start trading"}
            </button>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {STAGES.map((stage) => {
              const active = currentStage === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  disabled={busy || signing || active}
                  onClick={() => setStage(stage.id)}
                  className={
                    active
                      ? `${walletNavButtonClass} !px-3 !py-1 text-base`
                      : `border-primary/15 text-primary/70 hover:bg-primary/10 rounded-[12px] border px-3 py-1 text-base font-medium disabled:opacity-40`
                  }
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
          <p className="text-primary/40 mt-2 text-base">
            Adjusts dates and status for testing. Does not run close settlement.
          </p>
      </>
      {error && <p className="text-red-400 mt-2 text-base">{error}</p>}
    </div>
  );
}
