import { useCallback, useEffect, useRef, useState } from "react";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import CreatorAvatar from "@/components/creators/CreatorAvatar";
import CaretDown from "@/components/fundations/icons/CaretDown";
import SignOut from "@/components/fundations/icons/SignOut";
import { formatUsdExact } from "@/lib/funds/format";
import { ensureDepositWallet } from "@/lib/polymarket/depositWallet";
import { addressDisplayFallback } from "@/lib/polymarket/profile";
import { transferPusdToDepositWallet } from "@/lib/polymarket/transfer-pusd";
import {
  fetchPolymarketWalletInfo,
  type PolymarketWalletInfo,
} from "@/lib/polymarket/wallet-info";
import { DEPOSIT_WALLET_UPDATED_EVENT } from "@/lib/wagmi/events";
import { wagmiConfig } from "@/lib/wagmi/config";

type Props = {
  address: `0x${string}`;
  label: string;
  onLogout: () => void;
};

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export default function WalletAccountMenu({ address, label, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PolymarketWalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInfo(await fetchPolymarketWalletInfo(address));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load wallet info");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    const onUpdate = () => {
      if (open) void refresh();
    };
    window.addEventListener(DEPOSIT_WALLET_UPDATED_EVENT, onUpdate);
    return () =>
      window.removeEventListener(DEPOSIT_WALLET_UPDATED_EVENT, onUpdate);
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function registerWithPolymarket() {
    setBusy(true);
    setError(null);
    setStatus("Approve in Privy to create your Polymarket deposit wallet…");

    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) throw new Error("Wallet not ready");

      await ensureDepositWallet(walletClient, setStatus);
      setStatus("Polymarket deposit wallet ready");
      window.dispatchEvent(new Event(DEPOSIT_WALLET_UPDATED_EVENT));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function movePusdToDeposit() {
    if (!info?.depositDeployed) {
      setError("Register with Polymarket first");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Moving pUSD to your deposit wallet…");

    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) throw new Error("Wallet not ready");

      await transferPusdToDepositWallet(walletClient, info.depositAddress);
      setStatus("pUSD moved to deposit wallet");
      window.dispatchEvent(new Event(DEPOSIT_WALLET_UPDATED_EVENT));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  const canMovePusd = (info?.ownerPusd ?? 0) > 0 && info?.depositDeployed;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="hover:bg-primary/5 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors"
      >
        <CreatorAvatar address={address} name={label} size="xs" />
        <span className="text-primary max-w-32 truncate text-sm">{label}</span>
        <CaretDown size="sm" className="text-primary/50" />
      </button>

      {open && (
        <div
          role="menu"
          className="border-primary/10 bg-secondary absolute right-0 z-50 mt-2 w-80 rounded-lg border p-3 shadow-lg"
        >
          <p className="text-primary/45 text-sm font-medium uppercase tracking-wide">
            Privy wallet
          </p>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-primary/50">EOA</span>
              <button
                type="button"
                className="text-primary font-mono hover:underline"
                onClick={() => copyText(address)}
                title={address}
              >
                {shortAddress(address)}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-primary/50">pUSD on EOA</span>
              <span className="text-primary font-mono tabular-nums">
                {loading
                  ? "…"
                  : formatUsdExact(info?.ownerPusd ?? 0)}
              </span>
            </div>
          </div>

          <div className="border-primary/10 mt-3 border-t pt-3">
            <p className="text-primary/45 text-sm font-medium uppercase tracking-wide">
              Polymarket deposit wallet
            </p>
            <p className="text-primary/45 mt-1 text-sm leading-relaxed">
              Send pUSD here — not your Privy EOA. Fund commitments use this
              address.
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-primary/50">Address</span>
                {info ? (
                  <button
                    type="button"
                    className="text-primary font-mono hover:underline"
                    onClick={() => copyText(info.depositAddress)}
                    title={info.depositAddress}
                  >
                    {shortAddress(info.depositAddress)}
                  </button>
                ) : (
                  <span className="text-primary/40">…</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-primary/50">Status</span>
                <span
                  className={
                    info?.depositDeployed
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }
                >
                  {loading
                    ? "…"
                    : info?.depositDeployed
                      ? "Registered"
                      : "Not registered"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-primary/50">Balance</span>
                <span className="text-primary font-mono tabular-nums">
                  {loading
                    ? "…"
                    : formatUsdExact(info?.depositCollateral ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {status && (
            <p className="text-primary/60 mt-3 text-xs">{status}</p>
          )}
          {error && (
            <p className="text-red-400 mt-2 text-xs">{error}</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {!info?.depositDeployed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void registerWithPolymarket()}
                className="bg-accent text-secondary hover:opacity-90 disabled:opacity-50 w-full rounded px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed"
              >
                Register with Polymarket
              </button>
            )}

            {canMovePusd && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void movePusdToDeposit()}
                className="border-primary/15 text-primary hover:bg-primary/5 disabled:opacity-50 w-full rounded border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed"
              >
                Move pUSD to deposit wallet
              </button>
            )}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="text-primary hover:bg-primary/5 mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors"
          >
            <SignOut size="sm" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
