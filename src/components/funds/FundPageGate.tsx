import { useEffect, useState } from "react";
import { getWalletClient } from "@wagmi/core";
import ConnectWallet from "@/components/app/ConnectWallet";
import FundPerformanceCell from "@/components/funds/FundPerformanceCell";
import FundPoolOverview from "@/components/funds/FundPoolOverview";
import FundSidebar from "@/components/funds/FundSidebar";
import type { Fund } from "@/lib/funds/types";
import {
  formatUnlockPaymentError,
  payBundleUnlock,
} from "@/lib/polymarket/unlock-payment";
import { wagmiConfig } from "@/lib/wagmi/config";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

export type FundPageMeta = Pick<
  Fund,
  "slug" | "name" | "manager" | "status" | "unlockPriceUsdc" | "createdAt"
>;

type Props = {
  fund: FundPageMeta;
  paymentRecipient: `0x${string}` | null;
  platformFeeWallet: `0x${string}` | null;
};

export default function FundPageGate({
  fund,
  paymentRecipient,
  platformFeeWallet,
}: Props) {
  const { address, isConnected, restoring } = useWalletSession();
  const { onPolygon, switching } = useEnsurePolygon();
  const [access, setAccess] = useState<boolean | null>(null);
  const [fullFund, setFullFund] = useState<Fund | null>(null);
  const [priceUsdc, setPriceUsdc] = useState<number | null>(
    fund.unlockPriceUsdc ?? null,
  );
  const [paying, setPaying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      const params = new URLSearchParams();
      if (address) params.set("address", address);

      const res = await fetch(`/api/funds/${fund.slug}/access?${params}`);
      const data = await res.json();
      if (cancelled || !res.ok) return;

      setAccess(Boolean(data.access));
      if (data.priceUsdc != null) setPriceUsdc(Number(data.priceUsdc));
    }

    if (restoring) return;
    void loadAccess();
    return () => {
      cancelled = true;
    };
  }, [fund.slug, address, restoring]);

  useEffect(() => {
    if (!access || !address) {
      setFullFund(null);
      return;
    }

    let cancelled = false;

    async function loadFund() {
      const res = await fetch(
        `/api/funds/${fund.slug}?address=${encodeURIComponent(address)}`,
      );
      const data = await res.json();
      if (cancelled || !res.ok) return;
      setFullFund(data as Fund);
    }

    void loadFund();
    return () => {
      cancelled = true;
    };
  }, [access, address, fund.slug]);

  async function unlock() {
    setError(null);
    setStatus(null);

    if (!isConnected || !address) return;
    if (!onPolygon) {
      setError(switching ? "Switching to Polygon…" : "Connect to Polygon first");
      return;
    }
    if (!priceUsdc || priceUsdc < 1) {
      setError("Invalid unlock price");
      return;
    }

    setPaying(true);

    try {
      if (!paymentRecipient) throw new Error("Creator wallet unavailable");

      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) throw new Error("Wallet not ready — reconnect and try again");

      setStatus("Approve payment in your wallet…");
      const txHash = await payBundleUnlock(
        walletClient,
        paymentRecipient,
        platformFeeWallet,
        priceUsdc,
        setStatus,
      );

      setStatus("Confirming unlock…");
      const res = await fetch(`/api/funds/${fund.slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, txHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not verify payment");

      setAccess(true);
      setStatus(null);
    } catch (e) {
      setError(formatUnlockPaymentError(e));
      setStatus(null);
    } finally {
      setPaying(false);
    }
  }

  if (access === null || restoring) {
    return <p className="text-primary/50 mt-8 text-sm">Loading…</p>;
  }

  if (!access) {
    return (
      <div className="border-primary/10 bg-primary/5 mt-8 max-w-lg rounded-lg border p-6">
        <p className="text-primary text-lg font-medium">Paid fund</p>
        <p className="text-primary/60 mt-2 text-sm">
          Unlock access to view the thesis and commit to this fund.
        </p>
        <p className="text-primary mt-4 font-mono text-3xl font-semibold tabular-nums">
          ${priceUsdc?.toFixed(2) ?? "—"}
        </p>

        {!isConnected ? (
          <div className="mt-6 space-y-3">
            <p className="text-primary/60 text-sm">Connect your wallet to unlock.</p>
            <ConnectWallet variant="panel" />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {status && <p className="text-primary/50 text-xs">{status}</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="button"
              disabled={paying || switching}
              onClick={() => void unlock()}
              className="bg-accent text-secondary hover:opacity-90 w-full rounded-full px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {paying ? "Processing…" : `Unlock for $${priceUsdc?.toFixed(2)}`}
            </button>
            <p className="text-primary/40 text-xs">
              Pays the creator from your Polymarket cash balance. Includes a 10%
              platform fee. Non-refundable.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!fullFund) {
    return <p className="text-primary/50 mt-8 text-sm">Loading fund…</p>;
  }

  return (
    <>
      <p className="text-primary/60 mt-2 max-w-2xl text-sm">{fullFund.thesis}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <FundPoolOverview fund={fullFund} />
        </div>
        <div>
          <FundSidebar fund={fullFund} />
        </div>
      </div>
    </>
  );
}
