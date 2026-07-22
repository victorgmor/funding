import { useEffect, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { getWalletClient } from "@wagmi/core";
import { isAddress, type Address } from "viem";
import { polygon } from "wagmi/chains";
import { formatUsdExact } from "@/lib/funds/format";
import { transferPusdFromDepositWalletTo } from "@/lib/polymarket/transfer-pusd";
import {
  fetchPolymarketWalletInfo,
  type PolymarketWalletInfo,
} from "@/lib/polymarket/wallet-info";
import { DEPOSIT_WALLET_UPDATED_EVENT } from "@/lib/wagmi/events";
import { wagmiConfig } from "@/lib/wagmi/config";
import { walletNavButtonClass, walletNavRadius } from "@/lib/walletNavChrome";

type Props = {
  open: boolean;
  address: `0x${string}`;
  onClose: () => void;
};

const shell =
  "w-full max-w-md overflow-hidden rounded-2xl bg-[#181709] text-white shadow-[0px_0px_40px_-8px_rgba(0,0,0,0.45)]";
const field =
  "w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-medium text-white/80";

export default function WithdrawFundsModal({ open, address, onClose }: Props) {
  const [info, setInfo] = useState<PolymarketWalletInfo | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const available = info?.withdrawableUsdc ?? 0;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatus(null);
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchPolymarketWalletInfo(address);
        if (!cancelled) setInfo(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load balance");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, address]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  async function withdraw() {
    const dest = to.trim();
    if (!isAddress(dest)) {
      setError("Enter a valid Polygon address");
      return;
    }
    const amountUsdc = Number(amount);
    if (!(amountUsdc > 0)) {
      setError("Enter a positive amount");
      return;
    }
    if (!info?.depositDeployed) {
      setError("Deposit wallet not ready yet");
      return;
    }
    if (amountUsdc > available) {
      setError(`Only ${formatUsdExact(available)} withdrawable`);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Sending pUSD…");

    try {
      const walletClient = await getWalletClient(wagmiConfig, {
        chainId: polygon.id,
        account: address,
      });
      if (!walletClient) throw new Error("Wallet not ready");

      await transferPusdFromDepositWalletTo(
        walletClient,
        info.depositAddress,
        address,
        dest as Address,
        amountUsdc,
      );

      setStatus("Sent");
      setAmount("");
      window.dispatchEvent(new Event(DEPOSIT_WALLET_UPDATED_EVENT));
      setInfo(await fetchPolymarketWalletInfo(address));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FloatingPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-funds-title"
          className={shell}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h2
                id="withdraw-funds-title"
                className="text-base font-semibold text-white"
              >
                Withdraw funds
              </h2>
              <p className="mt-2 text-sm text-white/50">
                Send withdrawable pUSD from your deposit wallet to any Polygon
                address. Capital locked in open fund mandates stays put.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              ✕
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <span className="text-sm text-white/55">Available</span>
              <span className="font-mono text-sm text-white tabular-nums">
                {formatUsdExact(available)} pUSD
              </span>
            </div>

            <div>
              <label className={labelClass} htmlFor="withdraw-to">
                Destination
              </label>
              <input
                id="withdraw-to"
                type="text"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                className={`${field} font-mono`}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-white/80" htmlFor="withdraw-amount">
                  Amount
                </label>
                <button
                  type="button"
                  disabled={available <= 0 || busy}
                  onClick={() =>
                    setAmount(String(Math.floor(available * 100) / 100))
                  }
                  className="text-xs font-medium uppercase tracking-wide text-white/50 transition-colors hover:text-white disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              <input
                id="withdraw-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className={`${field} tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
              />
            </div>

            {status && <p className="text-sm text-white/50">{status}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>

          <div className="flex gap-3 border-t border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={() => void withdraw()}
              disabled={busy || available <= 0}
              className={`${walletNavButtonClass} flex-1 border border-white/20 disabled:opacity-50`}
            >
              {busy ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={`flex-1 border border-white/25 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-40 ${walletNavRadius}`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
