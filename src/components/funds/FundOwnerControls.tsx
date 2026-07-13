import { useEffect, useState } from "react";
import ConnectWallet from "@/components/app/ConnectWallet";
import { isCreatorWallet } from "@/lib/funds/creator";
import { isFundOwner, isUserFund } from "@/lib/funds/editable";
import type { Fund } from "@/lib/funds/types";
import { signWalletMessage } from "@/lib/wagmi/signMessage";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";

type Props = {
  fund: Fund;
};

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
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    isOwner && name.trim() && thesis.trim() && fund.status === "trading";

  useEffect(() => {
    if (!managing || loaded) return;

    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/funds/${fund.slug}/edit`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load fund");
        setName(data.name);
        setThesis(data.thesis);
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load fund");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [managing, loaded, fund.slug]);

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

  async function closeFund() {
    if (!isOwner || !address || busy || fund.status === "closed") return;
    if (
      !window.confirm(
        "Close this fund? New commitments will be blocked.",
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
      if (!res.ok) throw new Error(data.error ?? "Could not close fund");

      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close fund");
      setBusy(false);
    }
  }

  const inputClass =
    "border-primary/10 bg-primary/5 text-primary placeholder:text-primary/60 w-full rounded border px-3 py-2 text-sm focus:border-primary/30 focus:outline-none";

  if (!isOwner) return null;

  if (!isConnected || !address) {
    return (
      <div className="border-primary/10 border-b pb-4">
        <p className="text-primary text-sm font-medium">Creator controls</p>
        <p className="text-primary/60 mt-1 text-xs">
          {restoring
            ? "Restoring wallet…"
            : "Connect the wallet that created this fund to edit or close it."}
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
    <div className="border-primary/10 border-b pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-primary text-sm font-medium">Creator controls</p>
          {fund.status === "closed" ? (
            <p className="text-primary/60 mt-1 text-xs">
              This fund is closed. New commitments are disabled.
            </p>
          ) : (
            <p className="text-primary/60 mt-1 text-xs">
              Published funds cannot be deleted. Edit details or close to new
              investors.
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
              onClick={closeFund}
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
          {!loaded ? (
            <p className="text-primary/50 text-sm">Loading…</p>
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
                    setLoaded(false);
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
