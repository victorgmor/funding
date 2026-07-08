import { useState } from "react";
import { connect, getConnectors, getWalletClient } from "@wagmi/core";
import { polygon } from "wagmi/chains";
import { useEnsurePolygon } from "@/lib/wagmi/useEnsurePolygon";
import { wagmiConfig } from "@/lib/wagmi/config";
import { useWalletSession } from "@/lib/wagmi/useWalletSession";
import { formatGiftError, sendGift } from "@/lib/polymarket/send-gift";
import type { Address } from "viem";

type Props = {
  recipient: Address;
  creatorName: string;
};

const amountClass =
  "text-primary w-12 border-0 bg-transparent px-0 py-0 text-sm text-right font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export default function GiftForm({ recipient, creatorName }: Props) {
  const { address, isConnected } = useWalletSession();
  const { onPolygon, switching } = useEnsurePolygon();
  const [connecting, setConnecting] = useState(false);
  const [amount, setAmount] = useState("5");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);

  const selfGift =
    Boolean(address) && address!.toLowerCase() === recipient.toLowerCase();

  async function send() {
    setFeedback(null);

    if (!isConnected) {
      const [connector] = getConnectors(wagmiConfig);
      if (!connector) return;
      setConnecting(true);
      try {
        await connect(wagmiConfig, { connector, chainId: polygon.id });
      } finally {
        setConnecting(false);
      }
      return;
    }

    if (!onPolygon) {
      setFeedback({
        kind: "error",
        message: switching ? "Switching to Polygon…" : "Connect to Polygon",
      });
      return;
    }

    const value = Number(amount);
    if (!address || !value || value < 1) {
      setFeedback({ kind: "error", message: "Minimum $1" });
      return;
    }
    if (selfGift) {
      setFeedback({ kind: "error", message: "Can't gift yourself" });
      return;
    }

    setSending(true);

    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient) {
        throw new Error("Wallet not ready — reconnect and try again");
      }

      await sendGift(walletClient, recipient, value);
      setFeedback({ kind: "success", message: "Sent" });
      setAmount("5");
    } catch (e) {
      setFeedback({ kind: "error", message: formatGiftError(e) });
    } finally {
      setSending(false);
    }
  }

  const busy = sending || connecting || switching;
  const label = sending ? "Sending…" : connecting ? "Connecting…" : "Gift";
  const feedbackClass =
    feedback?.kind === "success" ? "text-emerald-400" : "text-red-400";

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="border-primary/10 flex items-center gap-2 rounded-full border py-1 pl-3 pr-1">
        <span className="text-primary/40 text-sm">$</span>
        <input
          type="number"
          min={1}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
          aria-label={`Gift amount in USDC for ${creatorName}`}
          className={amountClass}
        />
        <button
          type="button"
          disabled={busy || selfGift}
          onClick={() => void send()}
          className="bg-accent text-white hover:opacity-90 rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {label}
        </button>
      </div>
      {feedback && (
        <p className={`text-xs ${feedbackClass}`}>{feedback.message}</p>
      )}
    </div>
  );
}
