import { useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import Providers from "@/components/app/Providers";
import { isFundOwner, isUserFund } from "@/lib/funds/editable";
import {
  resolveLifecycleStage,
  type LifecycleStage,
} from "@/lib/funds/lifecycle";
import type { Fund } from "@/lib/funds/types";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = { fund: Fund };

const STAGES: { id: LifecycleStage; label: string }[] = [
  { id: "deposit", label: "Open for orders" },
  { id: "trading", label: "Trading" },
  { id: "closed", label: "Closed" },
];

export default function FundLifecycleTestPanel(props: Props) {
  return (
    <Providers>
      <FundLifecycleTestPanelInner {...props} />
    </Providers>
  );
}

function FundLifecycleTestPanelInner({ fund }: Props) {
  const { address, isConnected, restoring } = useWalletSession();
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isUserFund(fund)) return null;
  if (!isFundOwner(fund, address)) return null;

  const currentStage = resolveLifecycleStage(fund);

  if (!isConnected || !address) {
    return (
      <div className="border-primary/10 bg-primary/5 mt-3 rounded-lg border border-dashed px-4 py-3">
        <p className="text-primary/50 text-[0.65rem] font-medium uppercase">
          Test lifecycle
        </p>
        <div className="mt-2">
          <p className="text-primary/60 mb-2 text-xs">
            Connect your creator wallet to switch stages.
          </p>
          {!restoring && <ConnectWallet variant="panel" />}
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
      const challengeData = await challengeRes.json();
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

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update stage");

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update stage");
      setBusy(false);
    }
  }

  return (
    <div className="border-primary/10 bg-primary/5 mt-3 rounded-lg border border-dashed px-4 py-3">
      <p className="text-primary/50 text-[0.65rem] font-medium uppercase">
        Test lifecycle
      </p>
      <>
          {currentStage === "deposit" && (
            <button
              type="button"
              disabled={busy || signing}
              onClick={() => setStage("trading")}
              className="bg-accent hover:bg-accent/80 disabled:bg-accent/40 mt-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed"
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
                      ? "bg-accent/20 text-accent border-accent/40 rounded-full border px-3 py-1 text-xs font-medium"
                      : "border-primary/15 text-primary/70 hover:bg-primary/10 rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40"
                  }
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
          <p className="text-primary/40 mt-2 text-xs">
            Adjusts dates and status for testing. Does not run close settlement.
          </p>
      </>
      {error && <p className="text-red-400 mt-2 text-xs">{error}</p>}
    </div>
  );
}
