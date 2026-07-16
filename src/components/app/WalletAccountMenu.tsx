import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivy, useSendTransaction } from "@privy-io/react-auth";
import { getAddress, isAddress } from "viem";
import { getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import CreatorAvatar from "@/components/creators/CreatorAvatar";
import { formatUsdExact } from "@/lib/funds/format";
import { ensureDepositWallet } from "@/lib/polymarket/depositWallet";
import { buildPusdTransferRequest } from "@/lib/polymarket/send-pusd";
import {
  transferPusdFromDepositWallet,
  transferPusdToDepositWallet,
} from "@/lib/polymarket/transfer-pusd";
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

function primaryEmail(user: ReturnType<typeof usePrivy>["user"]) {
  if (!user) return null;
  if (user.email?.address) return user.email.address;
  const google = user.linkedAccounts.find((a) => a.type === "google_oauth");
  if (google && "email" in google && google.email) return google.email;
  return null;
}

const panelClass =
  "absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-[var(--privy-border-radius-lg)] border border-[var(--privy-color-foreground-4)] bg-[var(--privy-color-background)] shadow-lg";
const rowBtnClass =
  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--privy-color-foreground)] transition-colors hover:bg-[var(--privy-color-background-2)]";
const sectionBtnClass =
  "w-full rounded-[var(--privy-border-radius-md)] border border-[var(--privy-color-foreground-4)] px-3 py-2 text-sm text-[var(--privy-color-foreground)] transition-colors hover:bg-[var(--privy-color-background-2)] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "w-full rounded-[var(--privy-border-radius-md)] border border-[var(--privy-color-foreground-4)] bg-[var(--privy-color-background-2)] px-3 py-2 text-sm text-[var(--privy-color-foreground)] placeholder:text-[var(--privy-color-foreground-3)] focus:border-[var(--privy-color-accent)] focus:outline-none";

export default function WalletAccountMenu({ address, label, onLogout }: Props) {
  const { user } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<PolymarketWalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const email = primaryEmail(user);

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

  async function movePusdFromDeposit() {
    if (!info?.depositDeployed) {
      setError("Register with Polymarket first");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Moving pUSD to your Privy wallet…");

    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) throw new Error("Wallet not ready");

      await transferPusdFromDepositWallet(
        walletClient,
        info.depositAddress,
        address,
      );
      setStatus("pUSD moved to Privy wallet");
      window.dispatchEvent(new Event(DEPOSIT_WALLET_UPDATED_EVENT));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function sendPusd() {
    const amountUsdc = Number(sendAmount);
    if (!sendTo.trim()) {
      setError("Recipient address required");
      return;
    }
    if (!isAddress(sendTo.trim())) {
      setError("Invalid recipient address");
      return;
    }
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (amountUsdc > (info?.ownerPusd ?? 0)) {
      setError("Amount exceeds pUSD on your Privy wallet");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const to = getAddress(sendTo.trim());
      await sendTransaction(buildPusdTransferRequest(to, amountUsdc), {
        address,
        uiOptions: { showWalletUIs: true },
      });
      setSendAmount("");
      setStatus("pUSD sent");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  const canMovePusd = (info?.ownerPusd ?? 0) > 0 && info?.depositDeployed;
  const canMoveFromDeposit =
    (info?.depositCollateral ?? 0) > 0 && info?.depositDeployed;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-[var(--privy-color-background-2)] px-2 py-1 text-[var(--privy-color-foreground-2)] transition-colors hover:text-[var(--privy-color-foreground)]"
      >
        <CreatorAvatar address={address} name={label} size="xs" />
        <span className="max-w-32 truncate text-sm">{label}</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Account" className={panelClass}>
          <div className="flex items-center justify-between border-b border-[var(--privy-color-foreground-4)] px-4 py-3">
            <p className="text-base font-medium text-[var(--privy-color-foreground)]">
              Account
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-full p-1 text-[var(--privy-color-foreground-3)] hover:bg-[var(--privy-color-background-2)] hover:text-[var(--privy-color-foreground)]"
            >
              ✕
            </button>
          </div>

          {email && (
            <p className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--privy-color-foreground)]">
              <span aria-hidden>✉</span>
              {email}
            </p>
          )}

          <button
            type="button"
            role="menuitem"
            className={rowBtnClass}
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <span aria-hidden>↪</span>
            Log out
          </button>

          <div className="border-t border-[var(--privy-color-foreground-4)] px-4 py-3">
            <p className="text-sm text-[var(--privy-color-foreground-3)]">
              Your wallet
            </p>
            <p className="mt-2 font-mono text-sm font-medium text-[var(--privy-color-foreground)]">
              {shortAddress(address)}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[var(--privy-color-foreground-3)]">
              {loading ? "…" : `${formatUsdExact(info?.ownerPusd ?? 0)} pUSD`}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void copyText(address)}
              className={`${sectionBtnClass} mt-3`}
            >
              Copy wallet address
            </button>
          </div>

          <div className="border-t border-[var(--privy-color-foreground-4)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--privy-color-foreground)]">
              Send pUSD
            </p>
            <p className="mt-1 text-sm text-[var(--privy-color-foreground-3)]">
              From your Privy wallet on Polygon.
            </p>
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="Recipient address (0x…)"
                className={inputClass}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="Amount"
                  className={inputClass}
                />
                <span className="shrink-0 text-sm text-[var(--privy-color-foreground-3)]">
                  pUSD
                </span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendPusd()}
                className="w-full rounded-[var(--privy-border-radius-md)] bg-[var(--privy-color-accent)] px-3 py-2 text-sm font-medium text-[var(--privy-color-foreground-accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send pUSD
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--privy-color-foreground-4)] px-4 py-3">
            <p className="text-sm font-medium text-[var(--privy-color-foreground)]">
              Polymarket deposit wallet
            </p>
            <p className="mt-1 text-sm text-[var(--privy-color-foreground-3)]">
              Fund commitments use this address. Move pUSD here to send from your
              Privy wallet.
            </p>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--privy-color-foreground-3)]">
                  Address
                </span>
                {info ? (
                  <button
                    type="button"
                    className="font-mono text-[var(--privy-color-foreground)] hover:underline"
                    onClick={() => copyText(info.depositAddress)}
                    title={info.depositAddress}
                  >
                    {shortAddress(info.depositAddress)}
                  </button>
                ) : (
                  <span className="text-[var(--privy-color-foreground-4)]">
                    …
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--privy-color-foreground-3)]">
                  Balance
                </span>
                <span className="font-mono tabular-nums text-[var(--privy-color-foreground)]">
                  {loading
                    ? "…"
                    : formatUsdExact(info?.depositCollateral ?? 0)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {!info?.depositDeployed && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void registerWithPolymarket()}
                  className={sectionBtnClass}
                >
                  Register with Polymarket
                </button>
              )}
              {canMoveFromDeposit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void movePusdFromDeposit()}
                  className={sectionBtnClass}
                >
                  Move pUSD to Privy wallet
                </button>
              )}
              {canMovePusd && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void movePusdToDeposit()}
                  className={sectionBtnClass}
                >
                  Move pUSD to deposit wallet
                </button>
              )}
            </div>
          </div>

          {status && (
            <p className="px-4 pb-2 text-sm text-[var(--privy-color-foreground-3)]">
              {status}
            </p>
          )}
          {error && (
            <p className="px-4 pb-3 text-sm text-red-400">{error}</p>
          )}

          <p className="border-t border-[var(--privy-color-foreground-4)] px-4 py-3 text-center text-xs text-[var(--privy-color-foreground-3)]">
            Protected by privy
          </p>
        </div>
      )}
    </div>
  );
}
